// .github/scripts/extract-queries.js
const fs = require('fs');
const path = require('path');

const SEARCH_DIR = './';  // Root directory to scan
const OUTPUT_FILE = path.resolve(__dirname, '../../reports/queries.json');

// Recursively find JS/TS files in a directory
function findJsFiles(dir) {
  let files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && !fullPath.includes('node_modules') && !fullPath.includes('.git')) {
      files = files.concat(findJsFiles(fullPath));
    } else if (item.isFile() && /\.(js|ts)$/.test(item.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

// Extract queries including collection name, method, and raw query string
function extractQueriesFromContent(content) {
  const queries = [];
  
  // Pattern 1: Direct MongoDB driver calls (db.collection('name').method())
  const mongoDriverRegex = /(?:await\s+)?(\w+)\.collection\(['"`](\w+)['"`]\)\s*(?:\.(\w+)\s*\([^)]*\)\s*)*\.(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;
  
  // Pattern 2: Chained MongoDB operations with multiple methods
  const chainedRegex = /(?:await\s+)?(\w+)\.collection\(['"`](\w+)['"`]\)\s*((?:\.\w+\s*\([^)]*\)\s*)*)/g;
  
  // Pattern 3: Mongoose Model operations (Model.find(), Model.aggregate(), etc.)
  const mongooseRegex = /(?:await\s+)?(\w+)\.(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)(?:\s*\.(\w+)\s*\([^)]*\))*/g;
  
  // Pattern 4: Collection variable operations (collection.find(), etc.)
  const collectionVarRegex = /(?:await\s+)?(\w+)\.(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g;

  // Process MongoDB driver patterns
  let match;
  while ((match = mongoDriverRegex.exec(content)) !== null) {
    const dbVar = match[1];
    const collection = match[2];
    const method = match[4];
    const rawQuery = match[5].trim();

    // Skip empty or placeholder queries
    if (!rawQuery || rawQuery === '{}' || rawQuery === '[]' || /\.{3}/.test(rawQuery)) {
      continue;
    }

    queries.push({ 
      collection, 
      method, 
      rawQuery,
      pattern: 'mongodb-driver',
      dbVar 
    });
  }

  // Process chained operations
  while ((match = chainedRegex.exec(content)) !== null) {
    const dbVar = match[1];
    const collection = match[2];
    const chainedMethods = match[3];
    
    // Parse chained methods
    const methodMatches = [...chainedMethods.matchAll(/\.(\w+)\s*\(([^)]*)\)/g)];
    
    if (methodMatches.length > 0) {
      const primaryMethod = methodMatches[0];
      const method = primaryMethod[1];
      const rawQuery = primaryMethod[2].trim();
      
      // Build query object for chained operations
      const queryParts = {};
      methodMatches.forEach(m => {
        const methodName = m[1];
        const methodArgs = m[2].trim();
        if (methodArgs && methodArgs !== '{}' && !methodArgs.includes('...')) {
          queryParts[methodName] = methodArgs;
        }
      });

      if (Object.keys(queryParts).length > 0) {
        queries.push({
          collection,
          method,
          rawQuery: JSON.stringify(queryParts),
          pattern: 'chained',
          dbVar
        });
      }
    }
  }

  // Process potential Mongoose patterns
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for Model.method() patterns
    const modelMatch = line.match(/(?:await\s+)?(\w+)\.(\w+)\s*\(([^)]*)\)/);
    if (modelMatch) {
      const modelName = modelMatch[1];
      const method = modelMatch[2];
      const args = modelMatch[3].trim();
      
      // Check if this looks like a MongoDB method
      const mongoMethods = ['find', 'findOne', 'findById', 'aggregate', 'updateOne', 'updateMany', 
                           'deleteOne', 'deleteMany', 'insertOne', 'insertMany', 'countDocuments', 
                           'distinct', 'replaceOne'];
      
      if (mongoMethods.includes(method) && args && args !== '{}' && !args.includes('...')) {
        queries.push({
          collection: modelName.toLowerCase(), // Assume model name is collection name
          method,
          rawQuery: args,
          pattern: 'mongoose-model'
        });
      }
    }
  }

  return queries;
}

async function main() {
  const files = findJsFiles(SEARCH_DIR);
  console.log(`Found ${files.length} JS/TS files to scan for queries...`);

  const allQueries = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const queries = extractQueriesFromContent(content);
      if (queries.length > 0) {
        console.log(`Found ${queries.length} queries in ${file}`);
        queries.forEach(q => q.file = file);
        allQueries.push(...queries);
      }
    } catch (err) {
      console.warn(`Error reading file ${file}:`, err.message);
    }
  }

  // Ensure reports directory exists
  const reportsDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
    console.log(`Created reports directory: ${reportsDir}`);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allQueries, null, 2));
  console.log(`Extracted ${allQueries.length} queries to ${OUTPUT_FILE}`);
  
  // Log some examples for debugging
  if (allQueries.length > 0) {
    console.log('\nExample queries found:');
    allQueries.slice(0, 3).forEach((q, i) => {
      console.log(`${i + 1}. ${q.collection}.${q.method}() from ${q.file}`);
    });
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

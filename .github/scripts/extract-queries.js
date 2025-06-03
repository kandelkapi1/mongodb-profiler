// .github/scripts/extract-queries.js
const fs = require('fs');
const path = require('path');

const SEARCH_DIR = './';  // Root directory to scan
const OUTPUT_FILE = path.resolve(__dirname, 'queries.json');

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
  
  // Match basic MongoDB operations
  const basicRegex = /db\.collection\(['"](\w+)['"]\)\s*\.(find|aggregate|update|delete)\s*\(([\s\S]*?)\)/g;
  
  // Match chained operations like .find().project()
  const chainedRegex = /db\.collection\(['"](\w+)['"]\)\s*\.find\((.*?)\)\.project\((.*?)\)/g;

  // Process basic operations
  let match;
  while ((match = basicRegex.exec(content)) !== null) {
    const collection = match[1];
    const method = match[2];
    const rawQuery = match[3].trim();

    // Skip queries containing ellipsis or empty placeholders
    if (/\.{3}/.test(rawQuery) || rawQuery === '{}' || rawQuery === '[]') {
      continue;
    }

    queries.push({ collection, method, rawQuery });
  }

  // Process chained operations
  while ((match = chainedRegex.exec(content)) !== null) {
    const collection = match[1];
    const findQuery = match[2].trim();
    const projectQuery = match[3].trim();

    // Skip if either part is a placeholder
    if ((/\.{3}/.test(findQuery) || findQuery === '{}') && 
        (/\.{3}/.test(projectQuery) || projectQuery === '{}')) {
      continue;
    }

    // Create a structured query object
    const rawQuery = JSON.stringify({
      find: findQuery,
      project: projectQuery
    });

    queries.push({ collection, method: 'find', rawQuery });
  }

  return queries;
}

async function main() {
  const files = findJsFiles(SEARCH_DIR);
  console.log(`Found ${files.length} JS/TS files to scan for queries...`);

  const allQueries = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const queries = extractQueriesFromContent(content);
    if (queries.length > 0) {
      queries.forEach(q => q.file = file);
      allQueries.push(...queries);
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allQueries, null, 2));
  console.log(`Extracted ${allQueries.length} queries to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

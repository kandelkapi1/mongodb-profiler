// .github/scripts/run-profiler.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'data'; // Allow DB name from env
const QUERIES_FILE = path.resolve(__dirname, 'queries.json');
const OUTPUT_FILE = path.resolve(__dirname, 'profiler-output.log');
const MAX_DOCS_EXAMINED = parseInt(process.env.MAX_DOCS_EXAMINED) || 500; // Limit docs examined for profiling

// Parse raw query string into JS object
async function parseRawQuery(raw) {
  try {
    // Attempt JSON parse first
    return JSON.parse(raw);
  } catch {
    try {
      // Fallback: eval for JS object literal strings
      return eval(`(${raw})`);
    } catch (e) {
      console.warn('Failed to parse raw query:', raw);
      return null;
    }
  }
}

// Get explain result for different MongoDB operations
async function getExplainResult(collection, method, rawQuery, pattern) {
  try {
    // Handle chained operations pattern
    if (pattern === 'chained') {
      const parsedQuery = JSON.parse(rawQuery);
      let cursor = collection.find(parsedQuery.find ? eval(`(${parsedQuery.find})`) : {});
      
      // Apply other chained methods
      if (parsedQuery.project) {
        cursor = cursor.project(eval(`(${parsedQuery.project})`));
      }
      if (parsedQuery.sort) {
        cursor = cursor.sort(eval(`(${parsedQuery.sort})`));
      }
      // Always apply limit for profiling to avoid full collection scans
      cursor = cursor.limit(MAX_DOCS_EXAMINED);
      if (parsedQuery.skip) {
        cursor = cursor.skip(parseInt(parsedQuery.skip));
      }
      
      return await cursor.explain('executionStats');
    }

    // Parse the query
    const queryObj = await parseRawQuery(rawQuery);
    if (!queryObj) {
      return { error: 'Invalid query syntax' };
    }

    // Handle different MongoDB methods with document examination limit
    switch (method.toLowerCase()) {
      case 'find':
      case 'findone':
        return await collection.find(queryObj).limit(MAX_DOCS_EXAMINED).explain('executionStats');
      
      case 'findbyid':
        // Convert string ID to ObjectId if needed
        const id = typeof queryObj === 'string' ? queryObj : queryObj._id || queryObj.id;
        return await collection.find({ _id: id }).limit(MAX_DOCS_EXAMINED).explain('executionStats');
      
      case 'aggregate':
        if (!Array.isArray(queryObj)) {
          return { error: 'Aggregate pipeline must be an array' };
        }
        // Add $limit stage to aggregate pipeline
        queryObj.push({ $limit: MAX_DOCS_EXAMINED });
        return await collection.aggregate(queryObj).explain('executionStats');
      
      case 'updateone':
      case 'updatemany':
      case 'replaceone':
        // For updates, explain the find part (filter) with limit
        if (Array.isArray(queryObj) && queryObj.length >= 1) {
          return await collection.find(queryObj[0]).limit(MAX_DOCS_EXAMINED).explain('executionStats');
        }
        return await collection.find(queryObj).limit(MAX_DOCS_EXAMINED).explain('executionStats');
      
      case 'deleteone':
      case 'deletemany':
        return await collection.find(queryObj).limit(MAX_DOCS_EXAMINED).explain('executionStats');
      
      case 'countdocuments':
      case 'estimateddocumentcount':
        return await collection.find(queryObj).limit(MAX_DOCS_EXAMINED).explain('executionStats');
      
      case 'distinct':
        // For distinct, we can only explain the filter part with limit
        if (Array.isArray(queryObj) && queryObj.length >= 2) {
          return await collection.find(queryObj[1] || {}).limit(MAX_DOCS_EXAMINED).explain('executionStats');
        }
        return await collection.find({}).limit(MAX_DOCS_EXAMINED).explain('executionStats');
      
      case 'insertone':
      case 'insertmany':
        // Insert operations don't have meaningful explain results
        return { info: 'Insert operations do not require query optimization' };
      
      default:
        return { error: `Unsupported method: ${method}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log(`Connected to MongoDB at ${MONGO_URI}`);
  console.log(`Using database: ${DB_NAME}`);
  console.log(`Profiling limited to examining ${MAX_DOCS_EXAMINED} documents per query`);
  
  const db = client.db(DB_NAME);

  if (!fs.existsSync(QUERIES_FILE)) {
    console.error('Queries file not found:', QUERIES_FILE);
    console.log('Please run extract-queries.js first to generate the queries file.');
    process.exit(1);
  }
  
  const queries = JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf-8'));
  console.log(`Running explain on ${queries.length} queries...`);

  if (queries.length === 0) {
    console.log('No queries found to analyze. Check if extract-queries.js found any queries.');
    await client.close();
    return;
  }

  const results = [];

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    console.log(`Processing query ${i + 1}/${queries.length}: ${q.collection}.${q.method}()`);
    
    try {
      const { collection, method, rawQuery, file, pattern } = q;
      
      if (!collection) {
        results.push({ file, collection, method, rawQuery, error: 'Collection name missing' });
        continue;
      }

      const coll = db.collection(collection);
      const explainResult = await getExplainResult(coll, method, rawQuery, pattern);

      results.push({ 
        file, 
        collection, 
        method, 
        rawQuery, 
        pattern: pattern || 'legacy',
        explain: explainResult 
      });
      
    } catch (err) {
      console.error(`Error processing query from ${q.file}:`, err.message);
      results.push({ 
        file: q.file, 
        collection: q.collection, 
        method: q.method, 
        rawQuery: q.rawQuery,
        error: err.message 
      });
    }
  }

  // Write results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nExplain results saved to ${OUTPUT_FILE}`);
  
  // Quick summary
  const successCount = results.filter(r => r.explain && !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  console.log(`\nSummary: ${successCount} successful, ${errorCount} errors out of ${results.length} total queries`);

  await client.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

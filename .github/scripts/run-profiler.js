// .github/scripts/run-profiler.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME = 'test'; // change if needed
const QUERIES_FILE = path.resolve(__dirname, 'queries.json');
const OUTPUT_FILE = path.resolve(__dirname, 'profiler-output.log');

// Safely parse raw query string into JS object
async function parseRawQuery(raw) {
  try {
    // Wrap in parentheses for object literals
    return eval(`(${raw})`);
  } catch (e) {
    console.warn('Failed to parse raw query:', raw);
    return null;
  }
}

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  if (!fs.existsSync(QUERIES_FILE)) {
    console.error('Queries file not found:', QUERIES_FILE);
    process.exit(1);
  }
  const queries = JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf-8'));
  console.log(`Running explain on ${queries.length} queries...`);

  const results = [];

  for (const q of queries) {
    try {
      const { collection, method, rawQuery, file } = q;
      const queryObj = await parseRawQuery(rawQuery);
      if (!queryObj) {
        results.push({ file, collection, method, rawQuery, error: 'Invalid query syntax' });
        continue;
      }
      if (!collection) {
        results.push({ file, collection, method, rawQuery, error: 'Collection name missing' });
        continue;
      }

      const coll = db.collection(collection);

      let explainResult;

      if (method === 'find') {
        explainResult = await coll.find(queryObj).explain('executionStats');
      } else if (method === 'aggregate') {
        // queryObj should be an array of pipeline stages
        if (!Array.isArray(queryObj)) {
          results.push({ file, collection, method, rawQuery, error: 'Aggregate argument is not an array' });
          continue;
        }
        explainResult = await coll.aggregate(queryObj).explain('executionStats');
      } else if (method === 'update') {
        // Explain find for update filter
        explainResult = await coll.find(queryObj).explain('executionStats');
      } else if (method === 'delete') {
        // Explain find for delete filter
        explainResult = await coll.find(queryObj).explain('executionStats');
      } else {
        explainResult = { error: 'Unsupported method ' + method };
      }

      results.push({ file, collection, method, rawQuery, explain: explainResult });
    } catch (err) {
      results.push({ error: err.message });
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Explain results saved to ${OUTPUT_FILE}`);

  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

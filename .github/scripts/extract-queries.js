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
    if (item.isDirectory()) {
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
  // Matches db.<collection>.find(<args>)[.project(<args>)]?
  const regex = /db\.(\w+)\.find\s*\(([\s\S]*?)\)(?:\.project\s*\(([\s\S]*?)\))?/g;

  let match;
  while ((match = regex.exec(content)) !== null) {
    const collection = match[1];
    const findArg = match[2].trim();
    const projectArg = match[3] ? match[3].trim() : null;

    // Compose rawQuery as an object with find and project to be interpreted in run-profiler.js
    const rawQuery = JSON.stringify({ find: findArg, project: projectArg });

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

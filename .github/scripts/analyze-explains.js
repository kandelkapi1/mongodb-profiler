// .github/scripts/analyze-explains.js
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.resolve(__dirname, 'profiler-output.log');
const SUMMARY_FILE = path.resolve(__dirname, 'profiler-summary.log');

function summarizeExplain(explain) {
  const stats = explain?.executionStats || {};
  const totalMillis = stats.executionTimeMillis || 0;

  // Try to find index name from queryPlanner winningPlan recursively
  function findIndexName(plan) {
    if (!plan) return null;
    if (plan.indexName) return plan.indexName;
    if (plan.inputStage) return findIndexName(plan.inputStage);
    if (plan.shards) {
      for (const shard of plan.shards) {
        const idx = findIndexName(shard.winningPlan);
        if (idx) return idx;
      }
    }
    if (plan.stage === 'FETCH' && plan.inputStage) return findIndexName(plan.inputStage);
    if (plan.stage === 'IXSCAN' && plan.indexName) return plan.indexName;
    if (plan.inputStages && plan.inputStages.length > 0) {
      for (const s of plan.inputStages) {
        const idx = findIndexName(s);
        if (idx) return idx;
      }
    }
    return null;
  }

  const indexUsed = findIndexName(explain?.queryPlanner?.winningPlan) || 'None';

  return { totalMillis, indexUsed };
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('Profiler output file not found:', INPUT_FILE);
    process.exit(1);
  }
  const results = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const summaryLines = [];

  for (const res of results) {
    if (res.error) {
      summaryLines.push(`Error in query from file ${res.file || 'unknown'}: ${res.error}`);
      continue;
    }
    const { method, file, collection, rawQuery, explain } = res;
    if (!explain) {
      summaryLines.push(`No explain result for query in ${file || 'unknown'}`);
      continue;
    }
    const { totalMillis, indexUsed } = summarizeExplain(explain);

    summaryLines.push(`File: ${file || 'unknown'}`);
    summaryLines.push(`Collection: ${collection || 'unknown'}`);
    summaryLines.push(`Method: ${method}`);
    summaryLines.push(`Execution Time (ms): ${totalMillis}`);
    summaryLines.push(`Index Used: ${indexUsed}`);
    summaryLines.push(`Query: ${rawQuery}`);
    summaryLines.push('---');
  }

  const summaryText = summaryLines.join('\n');
  fs.writeFileSync(SUMMARY_FILE, summaryText);

  // Append summary to main profiler output file
  fs.appendFileSync(INPUT_FILE, `\n\n--- Summary ---\n${summaryText}`);

  console.log(`Summary report saved to ${SUMMARY_FILE}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

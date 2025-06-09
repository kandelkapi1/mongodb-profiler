// .github/scripts/analyze-explains.js
const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.resolve(__dirname, '../../reports/profiler-output.log');
const SUMMARY_FILE = path.resolve(__dirname, '../../reports/profiler-summary.log');
const PR_REPORT_FILE = path.resolve(__dirname, '../../reports/pr-query-report.md');

// Performance thresholds from environment variables or defaults
const THRESHOLDS = {
  MAX_EXECUTION_TIME_MS: parseInt(process.env.MAX_EXECUTION_TIME_MS) || 100,
  WARN_EXECUTION_TIME_MS: parseInt(process.env.WARN_EXECUTION_TIME_MS) || 50,
  MAX_DOCS_EXAMINED: parseInt(process.env.MAX_DOCS_EXAMINED) || 500,
  MIN_QUERY_EFFICIENCY: parseFloat(process.env.MIN_QUERY_EFFICIENCY) || 0.1
};

console.log('Using performance thresholds:', THRESHOLDS);

function summarizeExplain(explain) {
  const stats = explain?.executionStats || {};
  const totalMillis = stats.executionTimeMillis || 0;
  const docsExamined = stats.totalDocsExamined || 0;
  const docsReturned = stats.totalDocsReturned || 0;
  const keysExamined = stats.totalKeysExamined || 0;

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

  function findStage(plan) {
    if (!plan) return null;
    if (plan.stage) return plan.stage;
    if (plan.shards && plan.shards.length > 0) {
      return findStage(plan.shards[0].winningPlan);
    }
    return null;
  }

  const indexUsed = findIndexName(explain?.queryPlanner?.winningPlan) || 'None';
  const stage = findStage(explain?.queryPlanner?.winningPlan) || 'Unknown';

  return { 
    totalMillis, 
    indexUsed, 
    stage,
    docsExamined, 
    docsReturned, 
    keysExamined 
  };
}

function analyzePerformance(result) {
  const { totalMillis, indexUsed, stage, docsExamined, docsReturned, keysExamined } = result;
  const issues = [];
  const warnings = [];
  const suggestions = [];

  // Handle empty collections (EOF stage)
  if (stage === 'EOF') {
    warnings.push('Query executed on empty collection - no performance issues to analyze');
    return {
      performanceScore: 'Good',
      issues,
      warnings,
      suggestions: ['Consider adding test data to validate query performance']
    };
  }

  // Execution time thresholds
  if (totalMillis > THRESHOLDS.MAX_EXECUTION_TIME_MS) {
    issues.push(`Slow query: ${totalMillis}ms execution time (threshold: ${THRESHOLDS.MAX_EXECUTION_TIME_MS}ms)`);
    suggestions.push('Consider optimizing query filters and adding appropriate indexes');
  } else if (totalMillis > THRESHOLDS.WARN_EXECUTION_TIME_MS) {
    warnings.push(`Moderate execution time: ${totalMillis}ms (warning threshold: ${THRESHOLDS.WARN_EXECUTION_TIME_MS}ms)`);
  }

  // Index usage analysis
  if (indexUsed === 'None' || stage === 'COLLSCAN') {
    issues.push('No index used - performs collection scan');
    suggestions.push('Consider adding an appropriate index for this query');
  }

  // Document examination threshold
  if (docsExamined > THRESHOLDS.MAX_DOCS_EXAMINED) {
    issues.push(`High document examination: ${docsExamined} documents scanned (threshold: ${THRESHOLDS.MAX_DOCS_EXAMINED})`);
    suggestions.push('Query examines too many documents - consider more selective filters or better indexing');
  }

  // Efficiency analysis
  if (docsExamined > 0 && docsReturned > 0) {
    const efficiency = docsReturned / docsExamined;
    if (efficiency < THRESHOLDS.MIN_QUERY_EFFICIENCY) {
      warnings.push(`Low query efficiency: ${(efficiency * 100).toFixed(1)}% (${docsReturned}/${docsExamined} docs, threshold: ${(THRESHOLDS.MIN_QUERY_EFFICIENCY * 100).toFixed(1)}%)`);
      suggestions.push('Query examines many documents but returns few - consider more selective filters');
    }
  }

  // Special case: examined documents but returned none
  if (docsExamined > 0 && docsReturned === 0) {
    warnings.push(`Query examined ${docsExamined} documents but returned none - possible inefficient query`);
    suggestions.push('Review query filters to ensure they match actual data or add appropriate indexes');
  }

  return {
    performanceScore: issues.length === 0 ? (warnings.length === 0 ? 'Good' : 'Fair') : 'Poor',
    issues,
    warnings,
    suggestions
  };
}

function generatePRReport(results) {
  const lines = [
    '# MongoDB Query Performance Report',
    '',
    'This report analyzes the performance of MongoDB queries found in the codebase.',
    '',
    '## Performance Thresholds',
    '',
    `- **Slow Query**: > ${THRESHOLDS.MAX_EXECUTION_TIME_MS}ms execution time`,
    `- **Warning**: > ${THRESHOLDS.WARN_EXECUTION_TIME_MS}ms execution time`,
    `- **High Document Examination**: > ${THRESHOLDS.MAX_DOCS_EXAMINED} documents scanned`,
    `- **Low Efficiency**: < ${(THRESHOLDS.MIN_QUERY_EFFICIENCY * 100).toFixed(1)}% query efficiency`,
    '',
    '## Summary',
    ''
  ];

  const totalQueries = results.length;
  const successfulQueries = results.filter(r => r.explain && !r.error).length;
  const errorQueries = results.filter(r => r.error).length;
  
  lines.push(`- **Total Queries Analyzed**: ${totalQueries}`);
  lines.push(`- **Successful Analysis**: ${successfulQueries}`);
  lines.push(`- **Errors**: ${errorQueries}`);
  lines.push('');

  if (successfulQueries === 0) {
    lines.push('⚠️ No queries could be analyzed successfully.');
    return lines.join('\n');
  }

  // Performance summary
  const performances = results
    .filter(r => r.explain && !r.error)
    .map(r => analyzePerformance(summarizeExplain(r.explain)));
  
  const goodQueries = performances.filter(p => p.performanceScore === 'Good').length;
  const fairQueries = performances.filter(p => p.performanceScore === 'Fair').length;
  const poorQueries = performances.filter(p => p.performanceScore === 'Poor').length;

  lines.push('## Performance Overview');
  lines.push('');
  lines.push(`- 🟢 **Good Performance**: ${goodQueries} queries`);
  lines.push(`- 🟡 **Fair Performance**: ${fairQueries} queries`);
  lines.push(`- 🔴 **Poor Performance**: ${poorQueries} queries`);
  lines.push('');

  // Detailed analysis
  lines.push('## Detailed Query Analysis');
  lines.push('');

  results.forEach((res, index) => {
    if (res.error) {
      lines.push(`### Query ${index + 1}: ❌ Error`);
      lines.push(`**File**: \`${res.file || 'unknown'}\``);
      lines.push(`**Collection**: \`${res.collection || 'unknown'}\``);
      lines.push(`**Method**: \`${res.method}\``);
      lines.push(`**Error**: ${res.error}`);
      lines.push('');
      return;
    }

    if (!res.explain) {
      lines.push(`### Query ${index + 1}: ⚠️ No Analysis`);
      lines.push(`**File**: \`${res.file || 'unknown'}\``);
      lines.push('No explain result available');
      lines.push('');
      return;
    }

    const summary = summarizeExplain(res.explain);
    const analysis = analyzePerformance(summary);
    
    const statusIcon = analysis.performanceScore === 'Good' ? '✅' : 
                      analysis.performanceScore === 'Fair' ? '⚠️' : '❌';
    
    lines.push(`### Query ${index + 1}: ${statusIcon} ${analysis.performanceScore} Performance`);
    lines.push(`**File**: \`${res.file || 'unknown'}\``);
    lines.push(`**Collection**: \`${res.collection}\``);
    lines.push(`**Method**: \`${res.method}\``);
    lines.push(`**Execution Time**: ${summary.totalMillis}ms`);
    lines.push(`**Index Used**: \`${summary.indexUsed}\``);
    lines.push(`**Documents Examined**: ${summary.docsExamined}`);
    lines.push(`**Documents Returned**: ${summary.docsReturned}`);
    if (summary.docsExamined > 0 && summary.docsReturned > 0) {
      const efficiency = ((summary.docsReturned / summary.docsExamined) * 100).toFixed(1);
      lines.push(`**Query Efficiency**: ${efficiency}%`);
    }
    lines.push('');

    if (analysis.issues.length > 0) {
      lines.push('**🔴 Issues:**');
      analysis.issues.forEach(issue => lines.push(`- ${issue}`));
      lines.push('');
    }

    if (analysis.warnings.length > 0) {
      lines.push('**🟡 Warnings:**');
      analysis.warnings.forEach(warning => lines.push(`- ${warning}`));
      lines.push('');
    }

    if (analysis.suggestions.length > 0) {
      lines.push('**💡 Suggestions:**');
      analysis.suggestions.forEach(suggestion => lines.push(`- ${suggestion}`));
      lines.push('');
    }

    lines.push(`**Query**: \`${res.rawQuery}\``);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  // Add recommendations section
  if (poorQueries > 0 || fairQueries > 0) {
    lines.push('## 🚀 Optimization Recommendations');
    lines.push('');
    
    if (poorQueries > 0) {
      lines.push('### High Priority');
      lines.push('- Review queries marked as "Poor Performance"');
      lines.push('- Add indexes for queries performing collection scans');
      lines.push('- Optimize query filters to be more selective');
      lines.push(`- Reduce document examination below ${THRESHOLDS.MAX_DOCS_EXAMINED} documents`);
      lines.push('');
    }
    
    if (fairQueries > 0) {
      lines.push('### Medium Priority');
      lines.push('- Monitor queries with "Fair Performance" under load');
      lines.push('- Consider compound indexes for better efficiency');
      lines.push('- Review query patterns for potential optimization');
      lines.push('');
    }
  }

  return lines.join('\n');
}

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error('Profiler output file not found:', INPUT_FILE);
    process.exit(1);
  }
  
  const results = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  const summaryLines = [];

  console.log(`Analyzing ${results.length} query results...`);

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
    const summary = summarizeExplain(explain);
    const analysis = analyzePerformance(summary);

    summaryLines.push(`File: ${file || 'unknown'}`);
    summaryLines.push(`Collection: ${collection || 'unknown'}`);
    summaryLines.push(`Method: ${method}`);
    summaryLines.push(`Performance: ${analysis.performanceScore}`);
    summaryLines.push(`Execution Time (ms): ${summary.totalMillis}`);
    summaryLines.push(`Index Used: ${summary.indexUsed}`);
    summaryLines.push(`Documents Examined/Returned: ${summary.docsExamined}/${summary.docsReturned}`);
    if (analysis.issues.length > 0) {
      summaryLines.push(`Issues: ${analysis.issues.join(', ')}`);
    }
    summaryLines.push(`Query: ${rawQuery}`);
    summaryLines.push('---');
  }

  const summaryText = summaryLines.join('\n');
  fs.writeFileSync(SUMMARY_FILE, summaryText);

  // Generate PR report
  const prReport = generatePRReport(results);
  fs.writeFileSync(PR_REPORT_FILE, prReport);

  // Append summary to main profiler output file
  fs.appendFileSync(INPUT_FILE, `\n\n--- Summary ---\n${summaryText}`);

  console.log(`✅ Analysis complete!`);
  console.log(`📄 Summary report: ${SUMMARY_FILE}`);
  console.log(`📋 PR report: ${PR_REPORT_FILE}`);
  
  // Quick performance summary
  const successful = results.filter(r => r.explain && !r.error);
  if (successful.length > 0) {
    const performances = successful.map(r => analyzePerformance(summarizeExplain(r.explain)));
    const poor = performances.filter(p => p.performanceScore === 'Poor').length;
    const fair = performances.filter(p => p.performanceScore === 'Fair').length;
    const good = performances.filter(p => p.performanceScore === 'Good').length;
    
    console.log(`\n📊 Performance Summary:`);
    console.log(`   🟢 Good: ${good} | 🟡 Fair: ${fair} | 🔴 Poor: ${poor}`);
    
    if (poor > 0) {
      console.log('\n⚠️  Some queries have performance issues. Check the PR report for details.');
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

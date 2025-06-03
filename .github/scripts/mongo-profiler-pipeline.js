#!/usr/bin/env node
// .github/scripts/mongo-profiler-pipeline.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = __dirname;

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running ${scriptName}...`);
    console.log('=' .repeat(50));
    
    const child = spawn('node', [path.join(scriptsDir, scriptName)], {
      stdio: 'inherit',
      cwd: process.cwd()
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptName} completed successfully`);
        resolve();
      } else {
        console.error(`❌ ${scriptName} failed with exit code ${code}`);
        reject(new Error(`${scriptName} failed`));
      }
    });
    
    child.on('error', (err) => {
      console.error(`❌ Error running ${scriptName}:`, err.message);
      reject(err);
    });
  });
}

async function main() {
  console.log('🔍 MongoDB Query Profiler Pipeline');
  console.log('==================================');
  
  try {
    // Step 1: Extract queries from codebase
    await runScript('extract-queries.js');
    
    // Check if queries were found
    const queriesFile = path.join(scriptsDir, 'queries.json');
    if (!fs.existsSync(queriesFile)) {
      throw new Error('Queries file not generated');
    }
    
    const queries = JSON.parse(fs.readFileSync(queriesFile, 'utf-8'));
    if (queries.length === 0) {
      console.log('\n⚠️  No queries found in codebase. Pipeline completed with no analysis.');
      return;
    }
    
    console.log(`\n📊 Found ${queries.length} queries to analyze`);
    
    // Step 2: Run profiler (requires MongoDB connection)
    await runScript('run-profiler.js');
    
    // Step 3: Analyze explains
    await runScript('analyze-explains.js');
    
    console.log('\n🎉 Pipeline completed successfully!');
    console.log('\n📁 Output files:');
    console.log(`   - Extracted queries: ${path.relative(process.cwd(), queriesFile)}`);
    console.log(`   - Profiler results: ${path.relative(process.cwd(), path.join(scriptsDir, 'profiler-output.log'))}`);
    console.log(`   - Analysis summary: ${path.relative(process.cwd(), path.join(scriptsDir, 'profiler-summary.log'))}`);
    
  } catch (error) {
    console.error('\n💥 Pipeline failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   - Ensure MongoDB is running and accessible');
    console.log('   - Check your .env file for correct MONGO_URI and DB_NAME');
    console.log('   - Verify your queries use supported MongoDB operations');
    process.exit(1);
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Pipeline interrupted by user');
  process.exit(0);
});

main(); 
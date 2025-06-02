const { MongoClient } = require('mongodb');
const runQueries = require('../../queries/sample');

(async () => {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db('testdb');

    console.log('✅ Connected to MongoDB');

    // Enable full profiling
    await db.command({ profile: 2 });
    console.log('🔍 Profiling enabled (level 2)');

    // Run the sample queries
    await runQueries(db);
    console.log('📦 Queries executed');

    // Wait a bit to ensure profiler has logged
    await new Promise((r) => setTimeout(r, 1000));

    // Fetch profile logs
    const profileData = await db
      .collection('system.profile')
      .find()
      .sort({ ts: -1 })
      .limit(10)
      .toArray();

    console.log('--- MongoDB Profiling Output ---');
    profileData.forEach((entry, i) => {
      console.log(`\n#${i + 1}: ${entry.op} on ${entry.ns}`);
      console.log(JSON.stringify(entry.command || entry.query, null, 2));
      console.log(`Time: ${entry.millis} ms`);
    });

    await db.command({ profile: 0 });
    console.log('🛑 Profiling disabled');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.close();
  }
})();

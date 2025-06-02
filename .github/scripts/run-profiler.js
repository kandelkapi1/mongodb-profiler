const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const runQueries = require('../../queries/sample');

(async () => {
  const uri = 'mongodb://localhost:27017';
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db('testdb');

    await db.command({ profile: 2 });
    await runQueries(db);
    await new Promise((r) => setTimeout(r, 1000));

    const profileData = await db
      .collection('system.profile')
      .find()
      .sort({ ts: -1 })
      .limit(10)
      .toArray();

    const output = profileData.map((entry, i) => {
      return `#${i + 1} - ${entry.op} on ${entry.ns}\n` +
             `Command: ${JSON.stringify(entry.command || entry.query, null, 2)}\n` +
             `Time: ${entry.millis} ms\n`;
    }).join('\n\n');

    const filePath = path.join(__dirname, 'profiler-output.log');
    fs.writeFileSync(filePath, output, 'utf8');
  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await client.close();
  }
})();

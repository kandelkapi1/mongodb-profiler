const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db('live');

    const result = await db.collection('loads')
      .find({})
      .project({ caller: 1, reference_number: 1 })
      .toArray(); // Convert cursor to array

    console.log(result);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close(); // Close connection
  }
}

main().catch(console.error);
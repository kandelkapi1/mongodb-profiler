const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db('data');

    const result = await db.collection('chargetemplates')
      .find({})
      .project({ unitOfMeasure: 1, isActive: 1 })
      .toArray(); // Convert cursor to array
      
    console.log(result);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close(); // Close connection
  }
}

main().catch(console.error);
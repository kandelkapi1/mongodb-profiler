const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db('live');

    db.collection('loads').find({ 
      reference_number: "M002110"
    }).toArray(); // Convert cursor to array

    console.log(result.length);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close(); // Close connection
  }
}

main().catch(console.error);
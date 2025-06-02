const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;

async function main() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db('live'); // Using 'live' database from connection string

  const result = await db.collection('Setting').find({}).project({ clientId: 1, clientSecret: 1 }).toArray();
  console.log(result);
}
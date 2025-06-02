const { MongoClient } = require('mongodb');

async function runQueries(db) {
  const users = db.collection('users');

  await users.insertMany([
    { name: 'Alice', age: 25 },
    { name: 'Bob', age: 35 },
    { name: 'Charlie', age: 45 }
  ]);

  await users.find({ age: { $gt: 30 } }).sort({ name: 1 }).toArray();
}

module.exports = runQueries;

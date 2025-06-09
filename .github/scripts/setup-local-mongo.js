#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'live';
const MAX_RETRIES = 30;
const RETRY_DELAY = 2000; // 2 seconds

async function setupLocalMongoDB() {
    console.log('🚀 Setting up local MongoDB (without Docker)...\n');

    try {
        // Step 1: Check if MongoDB is running
        console.log('1️⃣  Checking MongoDB status...');
        const isRunning = await checkMongoDBRunning();
        
        if (!isRunning) {
            console.log('   MongoDB is not running, starting it...');
            await startLocalMongoDB();
        } else {
            console.log('   ✅ MongoDB is already running');
        }

        // Step 2: Wait for MongoDB to be ready
        console.log('\n2️⃣  Waiting for MongoDB to be ready...');
        await waitForMongoDB();
        console.log('✅ MongoDB is ready\n');

        // Step 3: Load data
        console.log('3️⃣  Loading data from datas folder...');
        const { loadData } = require('./load-data.js');
        
        // Temporarily set environment variables for data loading (no auth for local)
        const originalMongoUri = process.env.MONGO_URI;
        const originalDbName = process.env.DB_NAME;
        
        process.env.MONGO_URI = MONGO_URI;
        process.env.DB_NAME = DB_NAME;
        
        await loadData();
        console.log('✅ Data loaded successfully\n');
        
        // Restore original environment variables
        if (originalMongoUri) {
            process.env.MONGO_URI = originalMongoUri;
        } else {
            delete process.env.MONGO_URI;
        }
        if (originalDbName) {
            process.env.DB_NAME = originalDbName;
        } else {
            delete process.env.DB_NAME;
        }

        // Step 4: Show connection info
        console.log('🎉 Setup completed successfully!\n');
        console.log('📋 Connection Information:');
        console.log('   MongoDB URI: mongodb://localhost:27017');
        console.log(`   Database: ${DB_NAME}`);
        console.log('   Collection: loads\n');

        console.log('🔧 Available commands:');
        console.log('   npm run setup-local-mongo - Run this setup again');
        console.log('   npm run load-data        - Load data only');
        console.log('   npm run profile-local    - Run profiler on loaded data');
        console.log('   mongosh                  - Open MongoDB shell\n');

        // Step 5: Test connection and show sample data
        await showDatabaseInfo();

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Make sure MongoDB is installed (mongod --version)');
        console.log('   2. Start MongoDB manually: brew services start mongodb-community');
        console.log('   3. Or start with: mongod --dbpath /usr/local/var/mongodb');
        console.log('   4. Check if port 27017 is available: lsof -i :27017');
        process.exit(1);
    }
}

async function checkMongoDBRunning() {
    try {
        const client = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 1000,
            connectTimeoutMS: 1000
        });
        await client.connect();
        await client.db('admin').admin().ping();
        await client.close();
        return true;
    } catch (error) {
        return false;
    }
}

async function startLocalMongoDB() {
    try {
        console.log('   Attempting to start MongoDB service...');
        
        // Try different methods to start MongoDB
        const methods = [
            'brew services start mongodb-community',
            'brew services start mongodb/brew/mongodb-community',
            'sudo systemctl start mongod',
            'sudo service mongod start'
        ];

        for (const method of methods) {
            try {
                console.log(`   Trying: ${method}`);
                execSync(method, { stdio: 'pipe', timeout: 10000 });
                
                // Wait a bit and check if it worked
                await new Promise(resolve => setTimeout(resolve, 3000));
                const isRunning = await checkMongoDBRunning();
                
                if (isRunning) {
                    console.log('   ✅ MongoDB started successfully');
                    return;
                }
            } catch (err) {
                console.log(`   Failed: ${err.message}`);
                continue;
            }
        }

        // If all methods failed, provide manual instructions
        console.log('   ⚠️  Could not start MongoDB automatically');
        console.log('   Please start MongoDB manually with one of these commands:');
        console.log('     - brew services start mongodb-community');
        console.log('     - mongod --dbpath /usr/local/var/mongodb');
        console.log('     - sudo systemctl start mongod');
        console.log('\n   Then run this script again.');
        process.exit(1);

    } catch (error) {
        throw new Error(`Failed to start MongoDB: ${error.message}`);
    }
}

async function waitForMongoDB() {
    const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 2000
    });

    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            console.log(`   Attempting connection... (${i}/${MAX_RETRIES})`);
            await client.connect();
            await client.db('admin').admin().ping();
            await client.close();
            return;
        } catch (error) {
            if (i === MAX_RETRIES) {
                throw new Error(`MongoDB failed to respond after ${MAX_RETRIES} attempts`);
            }
            console.log(`   Connection failed, retrying in ${RETRY_DELAY/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
}

async function showDatabaseInfo() {
    console.log('📊 Database Status:');
    const client = new MongoClient(MONGO_URI);

    try {
        await client.connect();
        
        // List databases
        const adminDb = client.db('admin');
        const databases = await adminDb.admin().listDatabases();
        
        console.log('   Databases:');
        for (const db of databases.databases) {
            if (db.name !== 'admin' && db.name !== 'config' && db.name !== 'local') {
                console.log(`     - ${db.name}`);
                
                // List collections in this database
                const database = client.db(db.name);
                const collections = await database.listCollections().toArray();
                
                for (const collection of collections) {
                    const count = await database.collection(collection.name).countDocuments();
                    console.log(`       └── ${collection.name} (${count} documents)`);
                    
                    // Show sample document
                    if (count > 0) {
                        const sample = await database.collection(collection.name).findOne({});
                        console.log(`           Sample: ${JSON.stringify(sample, null, 2).substring(0, 100)}...`);
                    }
                }
            }
        }

    } catch (error) {
        console.log('   ⚠️  Could not retrieve database info:', error.message);
    } finally {
        await client.close();
    }
}

// Run setup if called directly
if (require.main === module) {
    setupLocalMongoDB();
}

module.exports = { setupLocalMongoDB, waitForMongoDB }; 
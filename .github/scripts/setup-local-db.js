#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const { MongoClient } = require('mongodb');
const path = require('path');

const MONGO_URI = 'mongodb://admin:password@localhost:27017';
const MAX_RETRIES = 30;
const RETRY_DELAY = 2000; // 2 seconds

// MongoDB Docker configuration
const MONGO_CONTAINER_NAME = 'mongo-profiler-db';
const MONGO_IMAGE = 'mongo:6.0';
const MONGO_PORT = '27017';

async function setupLocalDatabase() {
    console.log('🚀 Setting up local MongoDB database...\n');

    try {
        // Step 1: Start Docker MongoDB
        console.log('1️⃣  Starting MongoDB with Docker...');
        await startMongoDocker();
        console.log('✅ MongoDB container started\n');

        // Step 2: Wait for MongoDB to be ready
        console.log('2️⃣  Waiting for MongoDB to be ready...');
        await waitForMongoDB();
        console.log('✅ MongoDB is ready\n');

        // Step 3: Load data
        console.log('3️⃣  Loading data from datas folder...');
        const { loadData } = require('./load-data.js');
        await loadData();
        console.log('✅ Data loaded successfully\n');

        // Step 4: Show connection info
        console.log('🎉 Setup completed successfully!\n');
        console.log('📋 Connection Information:');
        console.log('   MongoDB URI: mongodb://admin:password@localhost:27017');
        console.log('   Admin Username: admin');
        console.log('   Admin Password: password');
        console.log('   Database: live');
        console.log('   Collection: loads\n');

        console.log('🔧 Available commands:');
        console.log('   npm run setup-db     - Run this setup again');
        console.log('   npm run load-data    - Load data only');
        console.log('   npm run start-db     - Start MongoDB container');
        console.log('   npm run stop-db      - Stop MongoDB container');
        console.log('   npm run db-status    - Check container status');
        console.log('   npm run profile-local - Run profiler on loaded data\n');

        // Step 5: Test connection and show sample data
        await showDatabaseInfo();

    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        console.log('\n🔧 Troubleshooting:');
        console.log('   1. Make sure Docker is running');
        console.log('   2. Make sure port 27017 is not already in use');
        console.log('   3. Try: docker stop mongo-profiler-db && docker rm mongo-profiler-db');
        console.log('   4. Then run: npm run setup-db again');
        process.exit(1);
    }
}

async function startMongoDocker() {
    try {
        // Check if container already exists
        try {
            const containerInfo = execSync(`docker inspect ${MONGO_CONTAINER_NAME}`, { encoding: 'utf8' });
            const container = JSON.parse(containerInfo)[0];
            
            if (container.State.Running) {
                console.log('   MongoDB container is already running');
                return;
            } else {
                console.log('   Starting existing MongoDB container...');
                execSync(`docker start ${MONGO_CONTAINER_NAME}`, { stdio: 'inherit' });
                return;
            }
        } catch (error) {
            // Container doesn't exist, create it
            console.log('   Creating new MongoDB container...');
        }

        // Create and start new MongoDB container
        const dockerCmd = [
            'docker run -d',
            `--name ${MONGO_CONTAINER_NAME}`,
            `-p ${MONGO_PORT}:27017`,
            '-e MONGO_INITDB_ROOT_USERNAME=admin',
            '-e MONGO_INITDB_ROOT_PASSWORD=password',
            '-e MONGO_INITDB_DATABASE=live',
            '-v mongo-profiler-data:/data/db',
            MONGO_IMAGE
        ].join(' ');

        execSync(dockerCmd, { stdio: 'inherit' });
        console.log('   MongoDB container created and started');

    } catch (error) {
        throw new Error(`Failed to start MongoDB Docker container: ${error.message}`);
    }
}

async function waitForMongoDB() {
    const clientOptions = {
        serverSelectionTimeoutMS: 2000,
        connectTimeoutMS: 2000
    };
    if (MONGO_URI.includes('@')) {
        clientOptions.authSource = 'admin';
    }
    
    const client = new MongoClient(MONGO_URI, clientOptions);

    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            console.log(`   Attempting connection... (${i}/${MAX_RETRIES})`);
            await client.connect();
            await client.db('admin').admin().ping();
            await client.close();
            return;
        } catch (error) {
            if (i === MAX_RETRIES) {
                throw new Error(`MongoDB failed to start after ${MAX_RETRIES} attempts`);
            }
            console.log(`   Connection failed, retrying in ${RETRY_DELAY/1000}s...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
    }
}

async function showDatabaseInfo() {
    console.log('📊 Database Status:');
    const clientOptions = {};
    if (MONGO_URI.includes('@')) {
        clientOptions.authSource = 'admin';
    }
    const client = new MongoClient(MONGO_URI, clientOptions);

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
    setupLocalDatabase();
}

module.exports = { setupLocalDatabase, waitForMongoDB }; 
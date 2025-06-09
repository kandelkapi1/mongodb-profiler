#!/usr/bin/env node

const { MongoClient, EJSON, ObjectId } = require('mongodb');
const fs = require('fs');
const path = require('path');

// Configuration
const DATA_DIR = path.join(__dirname, '../../datas');

// Convert MongoDB Extended JSON to native types
function convertExtendedJSON(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(convertExtendedJSON);
    }
    
    // Handle MongoDB Extended JSON types
    if (obj.$oid) {
        return new ObjectId(obj.$oid);
    }
    
    if (obj.$date) {
        return new Date(obj.$date);
    }
    
    if (obj.$numberLong) {
        return parseInt(obj.$numberLong);
    }
    
    if (obj.$numberDouble) {
        return parseFloat(obj.$numberDouble);
    }
    
    if (obj.$numberDecimal) {
        return parseFloat(obj.$numberDecimal);
    }
    
    // Recursively convert nested objects
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
        converted[key] = convertExtendedJSON(value);
    }
    
    return converted;
}

async function loadData() {
    // Get MONGO_URI at runtime to respect environment variable changes
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://admin:password@localhost:27017';
    
    // Only use authSource if the URI contains authentication
    const clientOptions = {};
    if (MONGO_URI.includes('@')) {
        clientOptions.authSource = 'admin';
    }
    
    const client = new MongoClient(MONGO_URI, clientOptions);

    try {
        console.log('🔌 Connecting to MongoDB...');
        await client.connect();
        console.log('✅ Connected to MongoDB');

        // Check if data directory exists
        if (!fs.existsSync(DATA_DIR)) {
            console.error('❌ Data directory not found:', DATA_DIR);
            return;
        }

        // Get all JSON files from data directory
        const allFiles = fs.readdirSync(DATA_DIR).filter(file => file.endsWith('.json'));
        
        // Separate data files from index files
        const dataFiles = allFiles.filter(file => !file.endsWith('.index.json'));
        const indexFiles = allFiles.filter(file => file.endsWith('.index.json'));
        
        if (allFiles.length === 0) {
            console.log('⚠️  No JSON files found in data directory');
            return;
        }

        console.log(`📁 Found ${allFiles.length} file(s):`);
        console.log(`   - ${dataFiles.length} data file(s)`);
        dataFiles.forEach(file => console.log(`     * ${file}`));
        console.log(`   - ${indexFiles.length} index file(s)`);
        indexFiles.forEach(file => console.log(`     * ${file}`));

        // Load data files first
        for (const file of dataFiles) {
            await loadFile(client, file);
        }

        // Then apply indexes
        for (const file of indexFiles) {
            await applyIndexes(client, file);
        }

        console.log('🎉 Data loading completed successfully!');

    } catch (error) {
        console.error('❌ Error loading data:', error);
        process.exit(1);
    } finally {
        await client.close();
    }
}

async function loadFile(client, filename) {
    const filePath = path.join(DATA_DIR, filename);
    
    // Parse database and collection from filename
    // Format: database.collection.json
    const nameWithoutExt = filename.replace('.json', '');
    const parts = nameWithoutExt.split('.');
    
    if (parts.length < 2) {
        console.log(`⚠️  Skipping ${filename} - invalid naming format (expected: database.collection.json)`);
        return;
    }

    const dbName = parts[0];
    const collectionName = parts.slice(1).join('.'); // Handle collection names with dots

    console.log(`\n📊 Loading ${filename} -> ${dbName}.${collectionName}`);

    try {
        // Read and parse JSON file
        console.log('   📖 Reading file...');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        let data;
        try {
            // Parse as regular JSON first
            const rawData = JSON.parse(fileContent);
            
            // Convert MongoDB Extended JSON format to native types
            data = convertExtendedJSON(rawData);
        } catch (parseError) {
            console.error(`   ❌ Failed to parse JSON in ${filename}:`, parseError.message);
            return;
        }

        // Ensure data is an array
        if (!Array.isArray(data)) {
            data = [data];
        }

        if (data.length === 0) {
            console.log('   ⚠️  No data to insert');
            return;
        }

        console.log(`   📝 Found ${data.length} documents`);

        // Get database and collection
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Check if collection already has data
        const existingCount = await collection.countDocuments();
        if (existingCount > 0) {
            console.log(`   ⚠️  Collection ${dbName}.${collectionName} already has ${existingCount} documents`);
            const confirmation = process.env.FORCE_RELOAD || await askForConfirmation(`   🤔 Do you want to clear and reload? (y/N): `);
            
            if (confirmation.toLowerCase() === 'y' || confirmation.toLowerCase() === 'yes') {
                console.log('   🧹 Clearing existing data...');
                await collection.deleteMany({});
            } else {
                console.log('   ⏭️  Skipping this collection');
                return;
            }
        }

        // Insert data in batches to handle large datasets
        const batchSize = 1000;
        let insertedCount = 0;

        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const result = await collection.insertMany(batch, { ordered: false });
            insertedCount += result.insertedCount;
            
            console.log(`   ⬆️  Inserted batch ${Math.floor(i/batchSize) + 1}: ${result.insertedCount} documents`);
        }

        console.log(`   ✅ Successfully loaded ${insertedCount} documents into ${dbName}.${collectionName}`);

        // Create some basic indexes
        console.log('   🗂️  Creating basic indexes...');
        try {
            if (data[0] && data[0]._id) {
                // _id index already exists by default
            }
            if (data[0] && data[0].createdAt) {
                await collection.createIndex({ createdAt: 1 });
                console.log('   ✅ Created index on createdAt');
            }
            if (data[0] && data[0].updatedAt) {
                await collection.createIndex({ updatedAt: 1 });
                console.log('   ✅ Created index on updatedAt');
            }
        } catch (indexError) {
            console.log('   ⚠️  Index creation warning:', indexError.message);
        }

    } catch (error) {
        console.error(`   ❌ Failed to load ${filename}:`, error);
    }
}

async function applyIndexes(client, filename) {
    const filePath = path.join(DATA_DIR, filename);
    
    // Parse database and collection from filename
    // Format: database.collection.index.json
    const nameWithoutExt = filename.replace('.index.json', '');
    const parts = nameWithoutExt.split('.');
    
    if (parts.length < 2) {
        console.log(`⚠️  Skipping ${filename} - invalid naming format (expected: database.collection.index.json)`);
        return;
    }

    const dbName = parts[0];
    const collectionName = parts.slice(1).join('.'); // Handle collection names with dots

    console.log(`\n🗂️  Applying indexes from ${filename} -> ${dbName}.${collectionName}`);

    try {
        // Read and parse index file
        console.log('   📖 Reading index definitions...');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        
        let indexes;
        try {
            indexes = JSON.parse(fileContent);
        } catch (parseError) {
            console.error(`   ❌ Failed to parse JSON in ${filename}:`, parseError.message);
            return;
        }

        // Ensure indexes is an array
        if (!Array.isArray(indexes)) {
            console.log('   ⚠️  Index file should contain an array of index definitions');
            return;
        }

        if (indexes.length === 0) {
            console.log('   ⚠️  No indexes to create');
            return;
        }

        console.log(`   📝 Found ${indexes.length} index definitions`);

        // Get database and collection
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Check if collection exists
        const collections = await db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
            console.log(`   ⚠️  Collection ${dbName}.${collectionName} doesn't exist, creating it first...`);
            // Insert a dummy document to create the collection, then remove it
            const tempResult = await collection.insertOne({ _temp: true });
            await collection.deleteOne({ _id: tempResult.insertedId });
        }

        // Apply indexes (skip the default _id index)
        let createdCount = 0;
        for (const indexDef of indexes) {
            try {
                // Skip the default _id index
                if (indexDef.name === '_id_') {
                    console.log(`   ⏭️  Skipping default _id index`);
                    continue;
                }

                // Create index options
                const options = {
                    name: indexDef.name
                };
                
                // Add optional properties if they exist
                if (indexDef.background !== undefined) options.background = indexDef.background;
                if (indexDef.unique !== undefined) options.unique = indexDef.unique;
                if (indexDef.sparse !== undefined) options.sparse = indexDef.sparse;
                if (indexDef.expireAfterSeconds !== undefined) options.expireAfterSeconds = indexDef.expireAfterSeconds;
                if (indexDef.partialFilterExpression !== undefined) options.partialFilterExpression = indexDef.partialFilterExpression;

                await collection.createIndex(indexDef.key, options);
                console.log(`   ✅ Created index: ${indexDef.name}`);
                createdCount++;
                
            } catch (indexError) {
                // If index already exists, that's usually OK
                if (indexError.code === 85 || indexError.message.includes('already exists')) {
                    console.log(`   ⚠️  Index ${indexDef.name} already exists, skipping`);
                } else {
                    console.error(`   ❌ Failed to create index ${indexDef.name}:`, indexError.message);
                }
            }
        }

        console.log(`   ✅ Successfully applied ${createdCount} new indexes to ${dbName}.${collectionName}`);

    } catch (error) {
        console.error(`   ❌ Failed to apply indexes from ${filename}:`, error);
    }
}

function askForConfirmation(question) {
    return new Promise((resolve) => {
        // In non-interactive environments, default to 'no'
        if (!process.stdin.isTTY) {
            resolve('n');
            return;
        }

        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

// Run the data loader
if (require.main === module) {
    loadData();
}

module.exports = { loadData }; 
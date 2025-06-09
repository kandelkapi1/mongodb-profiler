# Local MongoDB Setup Guide

This guide explains how to set up a local MongoDB instance using Docker and load your data from the `datas` folder.

## Prerequisites

- Docker installed and running
- Node.js and npm installed

## Quick Setup

Run the complete setup with one command:

```bash
npm run setup-db
```

This will:
1. Start MongoDB using Docker
2. Wait for MongoDB to be ready
3. Load all data from the `datas` folder
4. Show database status and connection info

## Data Loading Convention

The system uses the filename convention: `{database}.{collection}.json`

Examples:
- `live.loads.json` → Database: `live`, Collection: `loads`
- `users.profiles.json` → Database: `users`, Collection: `profiles`
- `analytics.events.data.json` → Database: `analytics`, Collection: `events.data`

## Available Commands

### Database Management
```bash
npm run start-db       # Start MongoDB container
npm run stop-db        # Stop MongoDB container
npm run db-status      # Check container status
```

### Data Operations
```bash
npm run load-data      # Load data from datas folder
npm run setup-db       # Complete setup (start + load data)
```

### Profiling
```bash
npm run profile-local  # Run profiler on local database
```

## Connection Information

- **MongoDB URI**: `mongodb://admin:password@localhost:27017`
- **Username**: `admin`
- **Password**: `password`
- **Port**: `27017`

## Manual Docker Operations

If you prefer to use Docker commands directly:

```bash
# Start MongoDB (create if doesn't exist)
docker start mongo-profiler-db || docker run -d --name mongo-profiler-db -p 27017:27017 -e MONGO_INITDB_ROOT_USERNAME=admin -e MONGO_INITDB_ROOT_PASSWORD=password -e MONGO_INITDB_DATABASE=live -v mongo-profiler-data:/data/db mongo:6.0

# View logs
docker logs -f mongo-profiler-db

# Stop MongoDB
docker stop mongo-profiler-db

# Remove container and data (clean restart)
docker stop mongo-profiler-db && docker rm mongo-profiler-db && docker volume rm mongo-profiler-data
```

## Troubleshooting

### Port Already in Use
If port 27017 is already in use:
```bash
# Check what's using the port
lsof -i :27017

# Stop any existing MongoDB processes
brew services stop mongodb-community  # If using Homebrew
# Or kill the process using the port
```

### Docker Issues
```bash
# Clean restart
docker stop mongo-profiler-db && docker rm mongo-profiler-db
npm run setup-db

# Check container logs
docker logs mongo-profiler-db
```

### Data Loading Issues
```bash
# Force reload existing data
FORCE_RELOAD=true npm run load-data

# Check MongoDB connection
docker exec -it mongo-profiler-db mongosh -u admin -p password --authenticationDatabase admin
```

## File Structure

```
├── datas/                      # Your JSON data files
│   └── live.loads.json        # Example: database=live, collection=loads
├── reports/                    # Generated profiler reports (git-ignored)
│   ├── queries.json           # Extracted queries
│   ├── profiler-output.log    # Detailed results
│   └── pr-query-report.md     # Human-readable report
├── .github/scripts/            # Setup and profiler scripts
│   ├── setup-local-db.js      # Docker-based setup
│   ├── setup-local-mongo.js   # Local MongoDB setup
│   ├── load-data.js           # Data loading script
│   └── example-query.js       # Sample MongoDB query
└── LOCAL_SETUP.md             # This setup guide
```

## MongoDB Shell Access

To connect to your MongoDB instance:

```bash
# Using Docker exec
docker exec -it mongo-profiler-db mongosh -u admin -p password --authenticationDatabase admin

# Using local mongosh (if installed)
mongosh "mongodb://admin:password@localhost:27017/live?authSource=admin"
```

## Performance Notes

- Data is loaded in batches of 1000 documents for better performance
- Basic indexes are created on `createdAt` and `updatedAt` fields if they exist
- Existing data is preserved unless you choose to reload

## Next Steps

Once your data is loaded, you can:
1. Run the profiler: `npm run profile-local`
2. Connect with MongoDB tools or GUI clients
3. Write and test your MongoDB queries
4. Use the existing profiler scripts to analyze query performance 
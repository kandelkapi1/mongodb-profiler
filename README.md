# MongoDB Query Profiler

An automated tool to extract, analyze, and profile MongoDB queries from your codebase. Perfect for identifying performance issues before they reach production and generating detailed reports for PR reviews.

## 🚀 Features

- **Automatic Query Extraction**: Finds MongoDB/Mongoose queries across your entire codebase
- **Performance Analysis**: Runs `explain()` on queries to analyze execution patterns
- **Smart Detection**: Supports various MongoDB patterns including:
  - MongoDB Driver: `db.collection('name').find({})`
  - Chained Operations: `db.collection('name').find({}).project().sort()`
  - Mongoose Models: `User.findOne({})`, `Product.aggregate([])`
  - Async/Await patterns
- **Detailed Reports**: Generates PR-ready performance reports with optimization suggestions
- **Performance Scoring**: Automatically categorizes queries as Good/Fair/Poor performance
- **CI/CD Ready**: GitHub Actions workflow included

## 📋 Supported MongoDB Methods

- `find`, `findOne`, `findById`
- `aggregate`
- `updateOne`, `updateMany`, `replaceOne`
- `deleteOne`, `deleteMany`
- `insertOne`, `insertMany`
- `countDocuments`, `distinct`

## 🛠️ Setup

### 1. Environment Configuration

Create a `.env` file in your project root:

```env
# MongoDB Configuration
MONGO_URI=mongodb://localhost:27017
DB_NAME=your_database_name

# For MongoDB Atlas
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/
```

### 2. Install Dependencies

```bash
npm install mongodb dotenv
```

## 🎯 Usage

### Complete Pipeline

Run the complete analysis pipeline:

```bash
npm run profile
```

This will:
1. Extract queries from your codebase
2. Run performance analysis on each query
3. Generate detailed reports

### Individual Steps

If you prefer to run each step individually:

```bash
# 1. Extract queries from codebase
npm run extract

# 2. Run profiler (requires MongoDB connection)
npm run analyze

# 3. Generate analysis reports
npm run report
```

## 📊 Output Files

After running the profiler, you'll get:

- **`queries.json`**: Extracted queries from your codebase
- **`profiler-output.log`**: Detailed explain results (JSON format)
- **`profiler-summary.log`**: Human-readable summary
- **`pr-query-report.md`**: Markdown report perfect for PR reviews

## 🔍 Performance Analysis

The profiler provides detailed performance insights:

### Performance Scoring
- **🟢 Good**: Fast queries with proper index usage (< 50ms)
- **🟡 Fair**: Moderate performance, may need optimization under load (50-100ms)
- **🔴 Poor**: Slow queries or collection scans that need immediate attention (> 100ms)

### Key Metrics Analyzed
- **Execution Time**: Query response time
- **Index Usage**: Whether queries use indexes effectively
- **Document Examination**: How many documents MongoDB scans vs. returns
- **Query Efficiency**: Ratio of documents returned to documents examined

## 🚨 GitHub Actions Integration

The repository includes a complete GitHub Actions workflow that automatically:

1. **Runs on PRs**: Analyzes queries in pull requests
2. **Sets up MongoDB**: Uses MongoDB service container
3. **Generates Reports**: Creates detailed performance reports
4. **Posts Comments**: Automatically comments on PRs with results
5. **Uploads Artifacts**: Saves profiler results for later review

### Setup Instructions

1. The workflow is already configured in `.github/workflows/profiler.yml`
2. It runs automatically on pull requests to `main` or `develop` branches
3. No additional setup required - just push your code!

### Workflow Features

- ✅ **Automatic MongoDB setup** with health checks
- ✅ **Smart error handling** with continue-on-error
- ✅ **Artifact uploads** for detailed analysis
- ✅ **PR comments** with performance reports
- ✅ **Status badges** showing analysis results

## 📝 Example Query Patterns Detected

The profiler detects various MongoDB query patterns:

```javascript
// MongoDB Driver - Basic
const result = await db.collection('users').find({ active: true });

// MongoDB Driver - Chained
const users = await db.collection('users')
  .find({ status: 'active' })
  .project({ name: 1, email: 1 })
  .sort({ createdAt: -1 })
  .toArray();

// Mongoose Models
const user = await User.findOne({ email: 'user@example.com' });
const products = await Product.aggregate([
  { $match: { category: 'electronics' } },
  { $group: { _id: '$brand', count: { $sum: 1 } } }
]);

// Update/Delete operations
await db.collection('orders').updateOne(
  { _id: orderId },
  { $set: { status: 'completed' } }
);
```

## 🔧 Configuration

### Database Connection

The profiler uses your `.env` file for MongoDB connection. Make sure your MongoDB instance is accessible and the database exists.

### Customizing Query Detection

You can modify `.github/scripts/extract-queries.js` to detect additional query patterns specific to your codebase.

### Performance Thresholds

Adjust performance thresholds in `.github/scripts/analyze-explains.js`:

```javascript
// Current thresholds
if (totalMillis > 100) {
  issues.push(`Slow query: ${totalMillis}ms execution time`);
} else if (totalMillis > 50) {
  warnings.push(`Moderate execution time: ${totalMillis}ms`);
}
```

## 🐛 Troubleshooting

### "No queries found"
- Check if your query patterns match the supported formats
- Ensure files are not in excluded directories (`node_modules`, `.git`)
- Verify your MongoDB connection strings use supported patterns

### Connection Errors
- Ensure MongoDB is running and accessible
- Check your `MONGO_URI` and `DB_NAME` in `.env`
- Verify network connectivity to MongoDB instance

### GitHub Actions Issues
- Check workflow logs in the Actions tab
- Ensure MongoDB service starts successfully
- Verify environment variables are set correctly

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new query patterns
4. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

**Perfect for**: Code reviews, performance monitoring, database optimization, and ensuring query efficiency in your MongoDB applications. 
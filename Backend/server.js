// MUST be first — loads .env before any other module reads process.env
require('dotenv').config();

// Entry point — starts the HTTP server
const app = require('./src/app');
const { connectDB } = require('./src/config/db');
const { startReminderJobs } = require('./src/jobs/reminderJob');

const PORT = process.env.PORT || 5000;

// Connect to MongoDB then start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ MediSync server running on port ${PORT} [${process.env.NODE_ENV}]`);
    // Start background cron jobs (reminders, missed-dose detection)
    startReminderJobs();
  });
}).catch((err) => {
  console.error('❌ Failed to connect to MongoDB:', err.message);
  process.exit(1);
});

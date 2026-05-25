require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const RequestLog = require('./models/RequestLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitgreen';

mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' }).then(async () => {
  const recentLogs = await RequestLog.find().sort({ createdAt: -1 }).limit(15);
  console.log("15 Most Recent Requests:");
  recentLogs.forEach(log => {
      console.log(`[${log.createdAt.toISOString()}] IP: ${log.ip} | Method: ${log.method} | URL: ${log.url} | UA: ${log.userAgent}`);
  });
  process.exit(0);
});

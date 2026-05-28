require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const RequestLog = require('./models/RequestLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitgreen';

mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' }).then(async () => {
  console.log('\n========== 15 MOST RECENT REQUESTS ==========');
  const recentLogs = await RequestLog.find().sort({ createdAt: -1 }).limit(15);
  recentLogs.forEach(log => {
    const blocked = log.isBlocked ? ' [BLOCKED]' : '';
    console.log(`[${log.createdAt.toISOString()}] ${log.status}${blocked} | IP: ${log.ip} | ${log.method} ${log.url} | UA: ${log.userAgent?.substring(0, 80)}`);
  });

  console.log('\n========== TOP 20 IPs BY REQUEST COUNT ==========');
  const topIPs = await RequestLog.aggregate([
    { $group: { _id: '$ip', count: { $sum: 1 }, country: { $first: '$country' }, ua: { $first: '$userAgent' }, blocked: { $sum: { $cond: ['$isBlocked', 1, 0] } } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  topIPs.forEach(r => {
    console.log(`  ${r.count} reqs (${r.blocked} blocked) | ${r._id} [${r.country}] | UA: ${r.ua?.substring(0, 60)}`);
  });

  console.log('\n========== TOP 20 URLS BY HIT COUNT ==========');
  const topURLs = await RequestLog.aggregate([
    { $group: { _id: '$url', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 20 }
  ]);
  topURLs.forEach(r => {
    console.log(`  ${r.count} hits | ${r._id}`);
  });

  console.log('\n========== BLOCKED REQUESTS SUMMARY ==========');
  const blockedCount = await RequestLog.countDocuments({ isBlocked: true });
  const totalCount = await RequestLog.countDocuments();
  console.log(`  Total logged: ${totalCount} | Blocked: ${blockedCount} | Pass rate: ${(((totalCount - blockedCount) / totalCount) * 100).toFixed(1)}%`);

  console.log('\n========== TOP COUNTRIES ==========');
  const topCountries = await RequestLog.aggregate([
    { $group: { _id: '$country', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  topCountries.forEach(r => {
    console.log(`  ${r.count} reqs | ${r._id}`);
  });

  process.exit(0);
});

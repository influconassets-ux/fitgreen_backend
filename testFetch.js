require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const MONGODB_URI = process.env.MONGODB_URI;

async function testFetch() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' });
    const user = await User.findOne({});
    console.log("Random User:", user);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
testFetch();

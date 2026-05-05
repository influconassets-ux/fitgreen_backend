require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('./models/Order');

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const MONGODB_URI = process.env.MONGODB_URI;

async function testFetchOrder() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' });
    const order = await Order.findOne({}).sort({ date: -1 });
    console.log(JSON.stringify(order, null, 2));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
testFetchOrder();

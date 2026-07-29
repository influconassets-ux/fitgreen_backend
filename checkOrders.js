const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });
const Order = require('./models/Order');

async function checkOrders() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'fitgreen' });
  
  // Revert orders to 'pending' if they are 'paid' but have no razorpayPaymentId
  // (These are the abandoned carts we accidentally marked as paid)
  const result = await Order.updateMany(
    { status: 'paid', razorpayPaymentId: { $exists: false } }, 
    { $set: { status: 'pending' } }
  );
  
  // Also catch cases where it might be null or empty string
  const result2 = await Order.updateMany(
    { status: 'paid', $or: [{ razorpayPaymentId: null }, { razorpayPaymentId: '' }] }, 
    { $set: { status: 'pending' } }
  );

  console.log(`Reverted ${result.modifiedCount + result2.modifiedCount} unpaid orders back to 'pending'.`);

  const orders = await Order.find().sort({ date: -1 }).limit(5);
  console.log("RECENT 5 ORDERS NOW:");
  orders.forEach(o => console.log(`ID: ${o.id}, Status: ${o.status}, Date: ${o.date}, PaymentID: ${o.razorpayPaymentId}`));
  process.exit(0);
}
checkOrders();

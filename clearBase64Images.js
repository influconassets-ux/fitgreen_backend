require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Order = require('./models/Order');

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const MONGODB_URI = process.env.MONGODB_URI;

async function clearHeavyImages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' });
    console.log('Connected.');

    // 1. Clear base64 images from standalone Orders
    console.log('Clearing base64 images from Orders collection...');
    const orders = await Order.find({});
    let ordersUpdated = 0;
    for (let order of orders) {
      let modified = false;
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          if (item.image && item.image.startsWith('data:image')) {
            item.image = ''; // Just clear it, we don't need heavy base64 strings in order history
            modified = true;
          }
        });
      }
      if (modified) {
        await order.save();
        ordersUpdated++;
      }
    }
    console.log(`✅ Cleared heavy images from ${ordersUpdated} Orders.`);

    // 2. Clear base64 images from nested User.orders
    console.log('Clearing base64 images from Users nested orders...');
    const users = await User.find({});
    let usersUpdated = 0;
    for (let user of users) {
      let modified = false;
      if (user.orders && user.orders.length > 0) {
        user.orders.forEach(order => {
          if (order.items && order.items.length > 0) {
            order.items.forEach(item => {
              if (item.image && item.image.startsWith('data:image')) {
                item.image = ''; // Clear it
                modified = true;
              }
            });
          }
        });
      }
      if (modified) {
        await user.save();
        usersUpdated++;
      }
    }
    console.log(`✅ Cleared heavy images from ${usersUpdated} Users.`);

    console.log('\nAll massive Base64 order images have been deleted from the database!');
    process.exit(0);
  } catch (err) {
    console.error('Failed:', err);
    process.exit(1);
  }
}

clearHeavyImages();

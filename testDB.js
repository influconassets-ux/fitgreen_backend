const mongoose = require('mongoose');
require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://fitgreen_user:Qkdwt5LM8x_N_vM@cluster0.sw9orf3.mongodb.net/fitgreen?retryWrites=true&w=majority';

async function checkDB() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");
  
  const MenuItem = require('./models/MenuItem');
  const items = await MenuItem.find();
  console.log(`Found ${items.length} items in DB.`);
  if (items.length > 0) {
    console.log("Sample item:", items[0]);
  }

  const Restaurant = require('./models/Restaurant');
  const rests = await Restaurant.find();
  console.log(`Found ${rests.length} restaurants in DB.`);
  if (rests.length > 0) {
    console.log("Sample restaurant:", rests[0]);
  }

  process.exit();
}

checkDB();

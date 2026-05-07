const mongoose = require('mongoose');
require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://fitgreen_user:Qkdwt5LM8x_N_vM@cluster0.sw9orf3.mongodb.net/fitgreen?retryWrites=true&w=majority';

async function fetchLogs() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");
  
  const db = mongoose.connection;
  const logs = await db.collection('webhooklogs').find().sort({ timestamp: -1 }).limit(1).toArray();
  
  if (logs.length > 0) {
    const payload = logs[0].payload;
    console.log("Latest Webhook Payload JSON Structure:");
    // Print top level keys
    console.log(Object.keys(payload));
    if (payload.restaurants && payload.restaurants[0]) {
      console.log("Restaurant Top Level Keys:", Object.keys(payload.restaurants[0]));
      
      if (payload.restaurants[0].parentcategories) {
         console.log("Parent Categories sample:", JSON.stringify(payload.restaurants[0].parentcategories[0], null, 2));
      } else if (payload.restaurants[0].categories) {
         console.log("Categories sample:", JSON.stringify(payload.restaurants[0].categories[0], null, 2));
      } else if (payload.restaurants[0].items) {
         console.log("Items sample:", JSON.stringify(payload.restaurants[0].items[0], null, 2));
      }
    }
    
    // Save to file for deeper inspection if needed
    require('fs').writeFileSync('payload_dump.json', JSON.stringify(payload, null, 2));
    console.log("Saved full payload to payload_dump.json");
  } else {
    console.log("No webhook logs found.");
  }

  process.exit();
}

fetchLogs();

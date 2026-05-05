require('dotenv').config();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const User = require('./models/User');

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const MONGODB_URI = process.env.MONGODB_URI;

async function migrateUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' });
    console.log('Connected.');

    const users = await User.find({});
    console.log(`Found ${users.length} users. Processing...`);

    let updatedCount = 0;

    for (const user of users) {
      if (user.photo && user.photo.startsWith('data:image')) {
        console.log(`Uploading photo for user: ${user.name || user.uid}...`);
        try {
          const uploadRes = await cloudinary.uploader.upload(user.photo, { folder: 'fitgreen_profiles' });
          user.photo = uploadRes.secure_url;
          await user.save();
          console.log(`✅ Migrated: ${user.name || user.uid} -> ${uploadRes.secure_url}`);
          updatedCount++;
        } catch (uploadErr) {
          console.error(`❌ Failed to upload photo for ${user.name || user.uid}:`, uploadErr.message);
        }
      }
    }

    console.log(`\nMigration complete. Updated ${updatedCount} users.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrateUsers();

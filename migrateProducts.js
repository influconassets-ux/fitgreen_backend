require('dotenv').config();
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Product = require('./models/Product');

const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const MONGODB_URI = process.env.MONGODB_URI;

async function migrateImages() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' });
    console.log('Connected.');

    const products = await Product.find({});
    console.log(`Found ${products.length} products. Processing...`);

    let updatedCount = 0;

    for (const product of products) {
      if (product.img && product.img.startsWith('data:image')) {
        console.log(`Uploading image for product: ${product.name}...`);
        try {
          const uploadRes = await cloudinary.uploader.upload(product.img, { folder: 'fitgreen_products' });
          product.img = uploadRes.secure_url;
          await product.save();
          console.log(`✅ Migrated: ${product.name} -> ${uploadRes.secure_url}`);
          updatedCount++;
        } catch (uploadErr) {
          console.error(`❌ Failed to upload image for ${product.name}:`, uploadErr.message);
        }
      } else {
        console.log(`⏭️ Skipped: ${product.name} (Already a URL or no image)`);
      }
    }

    console.log(`\nMigration complete. Updated ${updatedCount} products.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrateImages();

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// 1. STABLE CONNECTION: Use correct DNS module to force Google DNS so MongoDB connects on all ISPs
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = express();
app.use(cors());

// 2. IMAGE FIX: Increase JSON limit to 10MB to allow profile photos
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Firebase Admin initialization (Requires service account details)
if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_PRIVATE_KEY !== 'YOUR_PRIVATE_KEY_HERE') {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
    console.log('✅ Firebase Admin initialized successfully');
  } catch (err) {
    console.error('❌ Firebase Admin init failed:', err.message);
  }
} else {
  console.log('⚠️ WARNING: Firebase Admin credentials missing.');
}

const mongoose = require('mongoose');
const User = require('./models/User');

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitgreen';
mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' }) 
  .then(() => console.log('✅ Connected to MongoDB Successfully'))
  .catch((err) => console.error('❌ Could not connect to MongoDB:', err));

app.get('/', (req, res) => {
  res.send('FitGreen Backend is running');
});

// Route to verify Firebase Token & Sync/Create User in MongoDB
app.post('/verify-token', async (req, res) => {
  const { idToken, profileData } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, phone_number, email } = decodedToken;

    // BUILD DYNAMIC UPDATE: Only overwrite data if the values are NOT EMPTY
    // This prevents losing your name/address when you log out and log back in
    const updateData = {
      uid,
      phone: phone_number,
      updatedAt: new Date()
    };

    // If we have an email from Firebase, use it, otherwise use what's in profileData
    if (email) updateData.email = email;
    else if (profileData?.email) updateData.email = profileData?.email;

    // Capture all fields from profileData if they are provided (not empty)
    if (profileData?.name) updateData.name = profileData?.name;
    if (profileData?.address) updateData.address = profileData?.address;
    if (profileData?.pinCode) updateData.pinCode = profileData?.pinCode;
    if (profileData?.city) updateData.city = profileData?.city;
    if (profileData?.photo) updateData.photo = profileData?.photo;

    let user = await User.findOneAndUpdate(
      { uid },
      { $set: updateData },
      { upsert: true, returnDocument: 'after' }
    );

    res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ success: false, error: 'Token verification failed' });
  }
});

// Route to Save Order History in MongoDB
app.post('/place-order', async (req, res) => {
  const { idToken, orderData } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid } = decodedToken;

    // Add the order to the user's order array
    const user = await User.findOneAndUpdate(
      { uid },
      { $push: { orders: { $each: [orderData], $position: 0 } } },
      { upsert: true, returnDocument: 'after' }
    );

    if (!user) throw new Error("User not found in database");

    res.status(200).json({ success: true, orders: user.orders });
  } catch (error) {
    console.error('Failed to save order:', error);
    res.status(500).json({ success: false, error: 'Failed to save order history' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

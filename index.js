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
const Product = require('./models/Product');
const Order = require('./models/Order');
const Visit = require('./models/Visit');
const Coupon = require('./models/Coupon');
const Tip = require('./models/Tip');

// --- COUPON ROUTES ---

// 1. Fetch all coupons (Admin)
app.get('/api/coupons', async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.status(200).json(coupons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create/Update Coupon (Admin)
app.post('/api/coupons', async (req, res) => {
  try {
    const couponData = req.body;
    const coupon = await Coupon.findOneAndUpdate(
      { code: couponData.code.toUpperCase() },
      { $set: { ...couponData, code: couponData.code.toUpperCase() } },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, coupon });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Delete Coupon (Admin)
app.delete('/api/coupons/:code', async (req, res) => {
  try {
    await Coupon.findOneAndDelete({ code: req.params.code.toUpperCase() });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Validate Coupon (User Side)
app.post('/api/validate-coupon', async (req, res) => {
  try {
    const { code, cartTotal } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    
    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
    }

    if (cartTotal < coupon.minOrder) {
      return res.status(400).json({ success: false, message: `Minimum order of ₹${coupon.minOrder} required` });
    }

    res.status(200).json({ 
      success: true, 
      discountType: coupon.discountType, 
      discountValue: coupon.discountValue 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TIP OF THE DAY ROUTES ---

// 1. Fetch current tip (Public)
app.get('/api/tip', async (req, res) => {
  try {
    const tip = await Tip.findOne().sort({ updatedAt: -1 });
    if (!tip) {
      return res.status(200).json({ text: 'Start your meal with protein to stay fuller for longer and maintain steady energy throughout the day.' });
    }
    res.status(200).json(tip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Update tip (Admin)
app.post('/api/tip', async (req, res) => {
  try {
    const { text } = req.body;
    const tip = await Tip.findOneAndUpdate(
      {}, 
      { text, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true, tip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitgreen';
mongoose.connect(MONGODB_URI, { dbName: 'fitgreen' })
  .then(() => console.log('✅ Connected to MongoDB Successfully'))
  .catch((err) => console.error('❌ Could not connect to MongoDB:', err));

// --- PRODUCT ROUTES ---

// 1. Fetch all products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ updatedAt: -1 });
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create or Update Product
app.post('/api/products', async (req, res) => {
  const productData = req.body;
  try {
    const product = await Product.findOneAndUpdate(
      { id: productData.id },
      { $set: { ...productData, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Delete Product
app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findOneAndDelete({ id: req.params.id });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('FitGreen Backend is running');
});

// Route to verify Firebase Token & Sync/Create User in MongoDB
app.post('/verify-token', async (req, res) => {
  const { idToken, profileData } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, phone_number, email } = decodedToken;

    const updateData = {
      uid,
      phone: phone_number,
      updatedAt: new Date()
    };

    if (email) updateData.email = email;
    else if (profileData?.email) updateData.email = profileData?.email;

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

// Route to Save Order History in MongoDB (Stand-alone and User Nested)
app.post('/place-order', async (req, res) => {
  const { idToken, orderData } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid } = decodedToken;

    // 1. Fetch user to get name/email for the Order document
    const user = await User.findOne({ uid });

    // 2. Create Standalone Order in MongoDB
    const newOrder = new Order({
      ...orderData,
      customerUid: uid,
      customerName: user?.name || 'Customer',
      customerEmail: user?.email || '',
    });
    await newOrder.save();

    // 3. Sync to User's embedded order array (for user Profile view)
    await User.findOneAndUpdate(
      { uid },
      { $push: { orders: { $each: [orderData], $position: 0 } } }
    );

    res.status(200).json({ success: true, order: newOrder });
  } catch (error) {
    console.error('Failed to save order:', error);
    res.status(500).json({ success: false, error: 'Failed to save order history' });
  }
});

// --- VISITOR TRACKING ENDPOINT ---
app.post('/api/track-visit', async (req, res) => {
  try {
    const newVisit = new Visit();
    await newVisit.save();
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- ANALYTICS ROUTES (NOW TRACKING VISITORS) ---

app.get('/api/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const dailyVisits = await Visit.countDocuments({ timestamp: { $gte: startOfDay } });
    const monthlyVisits = await Visit.countDocuments({ timestamp: { $gte: startOfMonth } });
    const yearlyVisits = await Visit.countDocuments({ timestamp: { $gte: startOfYear } });

    // Generate graph data for last 14 days
    const graphData = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
      
      const count = await Visit.countDocuments({ timestamp: { $gte: start, $lte: end } });
      graphData.push({
        name: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        visitors: count
      });
    }

    const recentOrders = await Order.find().sort({ date: -1 }).limit(10);
    
    res.status(200).json({
      dailyVisits,
      monthlyVisits,
      yearlyVisits,
      graphData,
      recentOrders
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Fetch All Orders for Order Management Page (NOW FROM MONGODB)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5b. Fetch Orders for a Specific User
app.get('/api/orders/user/:uid', async (req, res) => {
  try {
    const orders = await Order.find({ customerUid: req.params.uid }).sort({ date: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Fetch All Customers for Customer Management Page
app.get('/api/customers', async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Admin Authentication Gateway
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  const masterUser = process.env.ADMIN_USER;
  const masterPass = process.env.ADMIN_PASS;

  if (!masterUser || !masterPass) {
    console.error('❌ SECURITY ALERT: Admin credentials not configured in .env');
    return res.status(500).json({ success: false, message: 'Server configuration error' });
  }

  if (username === masterUser && password === masterPass) {
    // In a prod environment, we would return a JWT token here
    res.status(200).json({ success: true, token: 'fitgreen-admin-master-key' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

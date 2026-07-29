require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { relayOrderToPetpooja } = require('./utils/petpoojaRelay');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 1. STABLE CONNECTION: Use correct DNS module to force Google DNS so MongoDB connects on all ISPs
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const app = express();
app.set('trust proxy', 1); // CRITICAL: Required for Render to pass the correct client IP to req.ip

const http = require('http');
const server = http.createServer(app);
const { limiter, requestLogger } = require('./utils/wafMiddleware');

// 0. BOT PROTECTION & LOGGING
app.use(requestLogger); // Log all requests for IP/Region tracking
app.use('/api/', limiter); // Apply stricter WAF rate limit to API routes

const { Server } = require('socket.io');
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

app.use(cors());
app.use(require('compression')()); // Compresses JSON payloads
app.set('socketio', io);

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('🔌 A user connected via Socket.io');

  socket.on('join', (uid) => {
    socket.join(uid);
    console.log(`👤 User joined room: ${uid}`);
  });

  socket.on('admin-join', () => {
    socket.join('admin-room');
    console.log(`🔑 Admin joined admin-room (Socket ID: ${socket.id})`);
    // Send a confirmation back to admin
    socket.emit('admin-join-success');
  });

  socket.on('disconnect', () => {
    console.log('🔌 User disconnected');
  });
});

// 2. IMAGE FIX: Increase JSON limit to 10MB to allow profile photos
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Razorpay Initialization
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const mongoose = require('mongoose');
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');
const Visit = require('./models/Visit');
const Coupon = require('./models/Coupon');
const Tip = require('./models/Tip');
const CorporateOrder = require('./models/CorporateOrder');
const CorporateClient = require('./models/CorporateClient');
const Event = require('./models/Event');

// --- PETPOOJA INTEGRATION ---
const petpoojaRoutes = require('./routes/petpooja');
app.use('/api/petpooja', petpoojaRoutes);

// --- TELEGRAM INTEGRATION ---
const { sendTelegramOrderNotification } = require('./utils/telegramNotification');

// Shortcut for grouped menu as requested
const Category = require('./models/Category');
const MenuItem = require('./models/MenuItem');

app.get('/api/menu', async (req, res) => {
  // FIX 1: Cache menu at CDN/proxy level for 5 minutes — 100 visitors = 1 DB hit, not 100
  res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  try {
    const categories = await Category.find().sort({ sortOrder: 1 });
    const items = await MenuItem.find({ available: true }).sort({ sortOrder: 1 });

    let menu = [];

    if (categories.length > 0) {
      menu = categories.map(cat => {
        const catItems = items.filter(item => item.petpoojaCategoryId === cat.petpoojaCategoryId);
        return {
          categoryName: cat.name,
          items: catItems.map(item => ({
            name: item.name,
            price: item.price,
            petpoojaItemId: item.petpoojaItemId,
            image: item.image,
            description: item.description,
            available: item.available,
            kcal: item.kcal,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            sugar: item.sugar,
            isMostLoved: item.isMostLoved,
            isSeasonal: item.isSeasonal,
            isSmoothie: item.isSmoothie
          }))
        };
      }).filter(cat => cat.items.length > 0);

      // Add items that don't belong to any found category
      const categorizedItemIds = new Set(menu.flatMap(c => c.items.map(i => i.petpoojaItemId)));
      const uncategorizedItems = items.filter(i => !categorizedItemIds.has(i.petpoojaItemId));

      if (uncategorizedItems.length > 0) {
        menu.push({
          categoryName: "Other Items",
          items: uncategorizedItems.map(item => ({
            name: item.name,
            price: item.price,
            petpoojaItemId: item.petpoojaItemId,
            image: item.image,
            description: item.description,
            available: item.available,
            kcal: item.kcal,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            sugar: item.sugar,
            isMostLoved: item.isMostLoved,
            isSeasonal: item.isSeasonal,
            isSmoothie: item.isSmoothie
          }))
        });
      }
    } else {
      // No categories at all - just return everything as "Menu"
      menu = [{
        categoryName: "Menu",
        items: items.map(item => ({
          name: item.name,
          price: item.price,
          petpoojaItemId: item.petpoojaItemId,
          image: item.image,
          description: item.description,
          available: item.available,
          kcal: item.kcal,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          sugar: item.sugar,
          isMostLoved: item.isMostLoved,
          isSeasonal: item.isSeasonal,
          isSmoothie: item.isSmoothie
        }))
      }];
    }

    res.status(200).json(menu);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


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

// --- SETTINGS / STORE STATUS ROUTES ---
const Settings = require('./models/Settings');

// 1. Get Store Status
app.get('/api/settings/store-status', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({ isStoreOpen: true, openingTime: "6:00 AM" });
    }
    res.status(200).json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Update Store Status (Admin)
app.post('/api/settings/store-status', async (req, res) => {
  try {
    const { isStoreOpen, openingTime } = req.body;
    const settings = await Settings.findOneAndUpdate(
      {},
      { isStoreOpen, openingTime },
      { upsert: true, new: true }
    );

    // Notify all connected clients via Socket.io
    io.emit('store-status-changed', settings);

    res.status(200).json({ success: true, settings });
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
    if (productData.img && productData.img.startsWith('data:image')) {
      console.log('Uploading product image to Cloudinary...');
      const uploadRes = await cloudinary.uploader.upload(productData.img, {
        folder: 'fitgreen_products',
        format: 'webp',
        quality: 'auto',
        transformation: [{ width: 800, crop: 'limit' }]
      });
      productData.img = uploadRes.secure_url;
      console.log('Upload complete:', productData.img);
    }

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

    if (profileData?.photo) {
      if (profileData.photo.startsWith('data:image')) {
        try {
          const uploadRes = await cloudinary.uploader.upload(profileData.photo, {
            folder: 'fitgreen_profiles',
            format: 'webp',
            quality: 'auto',
            transformation: [{ width: 400, crop: 'limit' }] // profiles can be smaller
          });
          updateData.photo = uploadRes.secure_url;
        } catch (err) {
          console.error('Failed to upload profile photo to Cloudinary:', err.message);
          updateData.photo = profileData.photo;
        }
      } else {
        updateData.photo = profileData.photo;
      }
    }

    let user = await User.findOneAndUpdate(
      { uid },
      { $set: updateData },
      { upsert: true, new: true }
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
      address: orderData.address || user?.address || 'N/A',
      city: orderData.city || user?.city || '',
      pinCode: orderData.pinCode || user?.pinCode || '',
      phone: orderData.phone || user?.phone || '',
    });
    await newOrder.save();

    // 3. Sync to User's embedded order array (for user Profile view)
    await User.findOneAndUpdate(
      { uid },
      { $push: { orders: { $each: [orderData], $position: 0 } } }
    );

    res.status(200).json({ success: true, order: newOrder });
    console.log(`📝 Order created in pending state: ${newOrder.id}`);
  } catch (error) {
    console.error('Failed to save order:', error);
    res.status(500).json({ success: false, error: 'Failed to save order history' });
  }
});

// --- RAZORPAY ROUTES ---

// 1. Create Razorpay Order
app.post('/api/razorpay/create-order', async (req, res) => {
  const { amount, currency = 'INR', receipt } = req.body;
  console.log(`💳 Razorpay Order Request Received: Amount=${amount}, Receipt=${receipt}`);
  try {
    const options = {
      amount: Math.round(amount * 100), // convert to paise and ensure it's an integer
      currency,
      receipt,
    };
    const order = await razorpay.orders.create(options);
    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('Razorpay order creation failed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Razorpay Webhook
app.post('/api/razorpay/webhook', async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  const shasum = crypto.createHmac('sha256', secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest('hex');

  if (signature === digest) {
    const event = req.body.event;
    const payload = req.body.payload;

    if (event === 'order.paid') {
      const razorpayOrderId = payload.order.entity.id;
      const razorpayPaymentId = payload.payment.entity.id;

      try {
        // Find the order by razorpayOrderId and update status
        const order = await Order.findOneAndUpdate(
          { razorpayOrderId: razorpayOrderId },
          {
            $set: {
              status: 'paid',
              razorpayPaymentId: razorpayPaymentId
            }
          },
          { new: true }
        );

        if (order) {
          console.log(`✅ Order ${order.id} marked as paid via webhook`);

          // --- TRIGGER PETPOOJA RELAY ---
          try {
            await relayOrderToPetpooja(order);
          } catch (relayErr) {
            console.error(`Failed to relay order ${order.id} to Petpooja:`, relayErr.message);
          }
          // ------------------------------

          // Also update embedded order in User model
          if (order.customerUid) {
            await User.findOneAndUpdate(
              { uid: order.customerUid, "orders.id": order.id },
              { $set: { "orders.$.status": 'paid' } }
            );
          }

          // Emit real-time update to user and admin
          const plainOrder = order.toObject();
          io.to('admin-room').emit('newOrder', plainOrder); // Notify admin of payment success
          io.emit('newOrder', plainOrder); // Fallback: Emit to everyone for reliability

          console.log(`🔥 Emitted newOrder event for ${order.id} to admin-room`);

          // --- TELEGRAM NOTIFICATION ---
          try {
            await sendTelegramOrderNotification(order);
          } catch (teleErr) {
            console.error(`Failed to send Telegram notification for order ${order.id}:`, teleErr.message);
          }
          // ------------------------------

          if (order.customerUid) {
            io.to(order.customerUid).emit('statusUpdate', {
              orderId: order.id,
              status: 'paid'
            });
          }
        }
      } catch (err) {
        console.error('Webhook processing failed:', err);
      }
    } else if (event === 'payment.failed') {
      const razorpayOrderId = payload.payment.entity.order_id;
      try {
        const order = await Order.findOneAndUpdate(
          { razorpayOrderId: razorpayOrderId },
          { $set: { status: 'failed' } },
          { new: true }
        );
        if (order) {
          console.log(`❌ Order ${order.id} marked as failed via webhook`);
          if (order.customerUid) {
            await User.findOneAndUpdate(
              { uid: order.customerUid, "orders.id": order.id },
              { $set: { "orders.$.status": 'failed' } }
            );
          }
        }
      } catch (err) {
        console.error('Failure webhook processing failed:', err);
      }
    }
    res.status(200).json({ status: 'ok' });
  } else {
    console.error('❌ Invalid Webhook Signature');
    res.status(400).json({ status: 'invalid signature' });
  }
});

// 3. Frontend Fallback Verification (For localhost testing & webhook failures)
app.post('/api/orders/verify-payment', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id } = req.body;
  
  try {
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    
    // If it's already paid via webhook, just return success
    if (order.status === 'paid') return res.status(200).json({ success: true });

    // Update status to paid
    const updatedOrder = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      { $set: { status: 'paid', razorpayPaymentId: razorpay_payment_id } },
      { new: true }
    );

    console.log(`✅ Order ${updatedOrder.id} marked as paid via FRONTEND FALLBACK`);
    
    // Trigger relays and sockets
    try { await relayOrderToPetpooja(updatedOrder); } catch (e) { console.error(e); }
    
    if (updatedOrder.customerUid) {
      await User.findOneAndUpdate(
        { uid: updatedOrder.customerUid, "orders.id": updatedOrder.id },
        { $set: { "orders.$.status": 'paid' } }
      );
    }
    
    io.to('admin-room').emit('newOrder', updatedOrder.toObject());
    io.emit('newOrder', updatedOrder.toObject());
    
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Frontend payment verification failed:', err);
    res.status(500).json({ success: false, error: err.message });
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

// --- OPTIMIZED STARTUP INITIALIZATION ---
// This endpoint combines store-status, tip, menu, and track-visit into one request.
// FIX 1: Cached at CDN for 5 minutes. Visit tracking is done client-side via /api/track-visit
// so bots and repeat CDN-cached hits don't inflate visitor counts.
app.get('/api/init', async (req, res) => {
  // FIX 1: Cache this response at CDN level for 5 minutes.
  // This means 100 visitors in 5 min = 1 backend hit instead of 100.
  res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  try {
    // Fetch Store Status, Tip, and Menu in parallel — 3x faster
    const SettingsModel = require('./models/Settings');
    const TipModel = require('./models/Tip');
    const CategoryModel = require('./models/Category');
    const MenuItemModel = require('./models/MenuItem');

    const [settingsResult, tipResult, categories, items] = await Promise.all([
      SettingsModel.findOne(),
      TipModel.findOne().sort({ updatedAt: -1 }),
      CategoryModel.find().sort({ sortOrder: 1 }),
      MenuItemModel.find({ available: true }).sort({ sortOrder: 1 })
    ]);

    const settings = settingsResult || { isStoreOpen: true, openingTime: "6:00 AM" };
    const tip = tipResult || { text: 'Start your meal with protein to stay fuller for longer and maintain steady energy throughout the day.' };

    let menu = [];
    if (categories.length > 0) {
      menu = categories.map(cat => {
        const catItems = items.filter(item => item.petpoojaCategoryId === cat.petpoojaCategoryId);
        return {
          categoryName: cat.name,
          items: catItems.map(item => ({
            name: item.name,
            price: item.price,
            petpoojaItemId: item.petpoojaItemId,
            image: item.image,
            description: item.description,
            available: item.available,
            kcal: item.kcal,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            sugar: item.sugar,
            isMostLoved: item.isMostLoved,
            isSeasonal: item.isSeasonal,
            isSmoothie: item.isSmoothie
          }))
        };
      }).filter(cat => cat.items.length > 0);
    }

    res.status(200).json({
      storeStatus: settings,
      tip: tip,
      menu: menu
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- REVIEW ROUTES ---
const Review = require('./models/Review');

app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await Review.find().sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews', async (req, res) => {
  const { videoUrl, posterUrl } = req.body;
  try {
    let finalVideoUrl = videoUrl;
    let finalPosterUrl = posterUrl || '';
    let cloudinaryId = '';

    if (videoUrl && videoUrl.startsWith('data:video')) {
      console.log('Uploading review video to Cloudinary...');
      const uploadRes = await cloudinary.uploader.upload(videoUrl, {
        folder: 'fitgreen_reviews',
        resource_type: 'video'
      });
      finalVideoUrl = uploadRes.secure_url;
      cloudinaryId = uploadRes.public_id;
      // Cloudinary automatically can serve a jpg from a video
      finalPosterUrl = finalVideoUrl.replace(/\.(mp4|webm|mov)$/i, '.jpg');
      console.log('Upload complete:', finalVideoUrl);
    }

    const review = await Review.create({
      videoUrl: finalVideoUrl,
      posterUrl: finalPosterUrl,
      cloudinaryId
    });

    res.status(201).json({ success: true, review });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reviews/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });

    if (review.cloudinaryId) {
      await cloudinary.uploader.destroy(review.cloudinaryId, { resource_type: 'video' });
    }

    await Review.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const recentOrders = await Order.find({ status: { $ne: 'pending' } }).sort({ date: -1 }).limit(10);

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

// --- REPORTS ROUTE ---
app.get('/api/reports/monthly-sales', async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'Month and year are required' });
    }

    // Parse month (1-12) to (0-11) for Date constructor
    const m = parseInt(month, 10) - 1;
    const y = parseInt(year, 10);

    const startOfMonth = new Date(y, m, 1);
    const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);

    const orders = await Order.find({
      date: { $gte: startOfMonth, $lte: endOfMonth },
      status: { $ne: 'pending' }
    }).sort({ date: 1 });

    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Fetch All Orders for Order Management Page (NOW FROM MONGODB)
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await Order.find({ status: { $ne: 'pending' } })
      .sort({ date: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/all', async (req, res) => {
  try {
    await Order.deleteMany({});
    await User.updateMany({}, { $set: { orders: [] } });
    res.status(200).json({ success: true, message: 'All orders deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5c. Update Order Status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;
    console.log(`Attempting status update for ${id} to: ${status}`);

    // Try to find by custom 'id' field OR MongoDB '_id'
    let query = { $or: [{ id: id }] };

    // If 'id' looks like a MongoDB ObjectId, add it to the $or query
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      query.$or.push({ _id: id });
    }

    const order = await Order.findOneAndUpdate(
      query,
      { $set: { status } },
      { new: true }
    );

    if (!order) {
      console.log(`Order ${id} not found in database for status update.`);
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // CRITICAL: Also update the status in the User's embedded orders array
    if (order.customerUid) {
      await User.findOneAndUpdate(
        { uid: order.customerUid, "orders.id": order.id },
        { $set: { "orders.$.status": status } }
      );
      console.log(`Updated status in User ${order.customerUid} embedded orders.`);
    }

    console.log(`Successfully updated order ${order.id} status to: ${order.status}`);

    // EMIT REAL-TIME UPDATE VIA SOCKET.IO
    if (order.customerUid) {
      io.to(order.customerUid).emit('statusUpdate', {
        orderId: order.id,
        status: status
      });
      console.log(`📢 Emitted real-time status update to user room: ${order.customerUid}`);
    }

    res.status(200).json({ success: true, order });
  } catch (err) {
    console.error(`Status update failed for ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// 5b. Fetch Orders for a Specific User
app.get('/api/orders/user/:uid', async (req, res) => {
  try {
    const user = await User.findOne({ uid: req.params.uid });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, orders: user.orders || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Fetch All Customers for Customer Management Page
app.get('/api/customers', async (req, res) => {
  try {
    const users = await User.find().select('-orders.items.image').sort({ createdAt: -1 });
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

// --- ADMIN TRAFFIC LOGS ---
const adminLogsRoutes = require('./routes/adminLogs');
app.use('/api/admin/logs', adminLogsRoutes);

// --- CORPORATE ORDERS ---
app.post('/api/corporate-orders', async (req, res) => {
  try {
    const newOrder = new CorporateOrder(req.body);
    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/corporate-orders', async (req, res) => {
  try {
    const orders = await CorporateOrder.find().sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/corporate-orders/:id', async (req, res) => {
  try {
    const updatedOrder = await CorporateOrder.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.status(200).json(updatedOrder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CORPORATE CLIENTS ---
app.post('/api/corporate-clients', async (req, res) => {
  try {
    const { email, password, companyName } = req.body;
    const newClient = new CorporateClient({ email, password, companyName });
    await newClient.save();
    res.status(201).json(newClient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/corporate-clients', async (req, res) => {
  try {
    const clients = await CorporateClient.find().sort({ createdAt: -1 });
    res.status(200).json(clients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/corporate-clients/:id', async (req, res) => {
  try {
    await CorporateClient.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/corporate-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const client = await CorporateClient.findOne({ email, password });
    if (!client) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    res.status(200).json({ success: true, client });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EVENTS API ---
app.get('/api/events', async (req, res) => {
  try {
    const { type } = req.query;
    let query = {};
    if (type) query.type = type;
    const events = await Event.find(query).sort({ createdAt: -1 });
    res.status(200).json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/events', async (req, res) => {
  try {
    const { type, title, date, time, venue, description, tags, coverPhotoBase64, thumbnailBase64, galleryBase64Array } = req.body;

    let newEventData = { type, title, date, venue, description };

    if (type === 'upcoming') {
      newEventData.time = time;
      newEventData.tags = tags || [];
      if (coverPhotoBase64) {
        const uploadResponse = await cloudinary.uploader.upload(coverPhotoBase64, { folder: "fitgreen/events" });
        newEventData.coverPhotoUrl = uploadResponse.secure_url;
      }
    } else if (type === 'recent') {
      if (thumbnailBase64) {
        const uploadResponse = await cloudinary.uploader.upload(thumbnailBase64, { folder: "fitgreen/events" });
        newEventData.thumbnailUrl = uploadResponse.secure_url;
      }
      if (galleryBase64Array && galleryBase64Array.length > 0) {
        const galleryUrls = [];
        for (const b64 of galleryBase64Array) {
          const uploadRes = await cloudinary.uploader.upload(b64, { folder: "fitgreen/events" });
          galleryUrls.push(uploadRes.secure_url);
        }
        newEventData.galleryUrls = galleryUrls;
      }
    }

    const newEvent = new Event(newEventData);
    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (err) {
    console.error("Event creation error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // We should ideally delete from Cloudinary here as well, but keeping it simple for now
    await Event.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- KEEP ALIVE ROUTE ---
// Ping this URL every 14 minutes to prevent Render from sleeping
app.get('/ping', (req, res) => {
  res.status(200).send('pong');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

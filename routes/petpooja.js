const express = require('express');
const axios = require('axios');
const router = express.Router();

const Restaurant = require('../models/Restaurant');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const Variant = require('../models/Variant');
const Addon = require('../models/Addon');
const Order = require('../models/Order');
const { relayOrderToPetpooja } = require('../utils/petpoojaRelay');

// Store Status Variable (in-memory for now, could be DB)
let storeStatus = "OPEN";

// --- FRONTEND MENU APIs ---
router.get('/menu', async (req, res) => {
  try {
    const restaurants = await Restaurant.find();
    res.status(200).json(restaurants);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Panel Fetch All Items (Including out of stock)
router.get('/items-all', async (req, res) => {
  try {
    const items = await MenuItem.find().sort({ updatedAt: -1 });
    res.status(200).json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Panel Update Item (Custom properties like macros, images)
router.put('/items/:id', async (req, res) => {
  try {
    const updateData = req.body;
    
    // Cloudinary upload if an image was updated (using similar logic as Product.js)
    const cloudinary = require('cloudinary').v2;
    if (updateData.image && updateData.image.startsWith('data:image')) {
      const uploadRes = await cloudinary.uploader.upload(updateData.image, { folder: 'fitgreen_products' });
      updateData.image = uploadRes.secure_url;
    }

    const item = await MenuItem.findOneAndUpdate(
      { itemId: req.params.id },
      { $set: updateData },
      { returnDocument: 'after' }
    );
    res.status(200).json({ success: true, item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/items', async (req, res) => {
  try {
    const items = await MenuItem.find({ available: true });
    res.status(200).json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. MENU PUSH WEBHOOK
router.post('/menu', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Petpooja Menu Push Webhook');
    
    // Save raw payload to DB for debugging
    const mongoose = require('mongoose');
    const db = mongoose.connection;
    await db.collection('webhooklogs').insertOne({ 
      timestamp: new Date(), 
      type: 'menu_push', 
      payload: payload 
    });

    // Assuming standard Petpooja payload structure: 
    // payload.restaurants[0] contains details, categories, items, etc.
    if (payload && payload.restaurants && payload.restaurants.length > 0) {
      for (const restData of payload.restaurants) {
        const details = restData.details || {};
        const restId = details.restaurantid || 'default_rest_id';
        const restName = details.restaurantname || 'FitGreen';
        const mappingCode = 'f871uxkp'; // As per plan instructions

        // Save Restaurant
        await Restaurant.findOneAndUpdate(
          { restaurantId: restId },
          { restaurantId: restId, restaurantName: restName, mappingCode: mappingCode },
          { upsert: true, returnDocument: 'after' }
        );

        // Robust Extraction Function for deep nesting
        const extractedCategories = [];
        const extractedItems = [];
        const extractedVariants = [];
        const extractedAddons = [];

        function parseNode(node, currentCatId = null) {
          if (!node || typeof node !== 'object') return;

          // If it's an array, iterate
          if (Array.isArray(node)) {
            node.forEach(child => parseNode(child, currentCatId));
            return;
          }

          // Check if it's a category
          if (node.categoryid && node.categoryname) {
            extractedCategories.push({
              categoryId: node.categoryid,
              name: node.categoryname,
              restaurantId: restId
            });
            currentCatId = node.categoryid;
          }

          // Check if it's an item
          if (node.itemid && (node.itemname || node.name)) {
            extractedItems.push({
              itemId: node.itemid,
              restaurantId: restId,
              categoryId: node.item_categoryid || node.categoryid || currentCatId || 'default',
              name: node.itemname || node.name,
              price: parseFloat(node.item_price) || parseFloat(node.price) || 0,
              available: node.active === "1" || node.in_stock === "1" || node.in_stock === "2" || node.available === true,
              image: node.item_image_url || node.image || '',
              description: node.itemdescription || node.item_description || node.description || ''
            });
          }

          // Check if it's an attribute/variant
          if (node.attributeid && node.attributename) {
            if (node.attribute_type === 'addon') {
              extractedAddons.push({
                addonId: node.attributeid,
                itemId: node.itemid || 'unknown',
                name: node.attributename,
                price: parseFloat(node.price) || 0
              });
            } else {
              extractedVariants.push({
                variantId: node.attributeid,
                itemId: node.itemid || 'unknown',
                name: node.attributename,
                price: parseFloat(node.price) || 0
              });
            }
          }

          // Recursively traverse all keys (parentcategories, categories, items, attributes)
          for (const key of Object.keys(node)) {
            if (typeof node[key] === 'object' && node[key] !== null) {
              parseNode(node[key], currentCatId);
            }
          }
        }

        // Run the recursive parser on the entire payload
        parseNode(payload);

        // Save Categories
        for (const cat of extractedCategories) {
          await Category.findOneAndUpdate(
            { categoryId: cat.categoryId },
            { categoryId: cat.categoryId, restaurantId: cat.restaurantId, name: cat.name },
            { upsert: true }
          );
        }

        // Save Items
        for (const item of extractedItems) {
          await MenuItem.findOneAndUpdate(
            { itemId: item.itemId },
            item,
            { upsert: true }
          );
        }

        // Save Addons
        for (const addon of extractedAddons) {
          await Addon.findOneAndUpdate(
            { addonId: addon.addonId },
            addon,
            { upsert: true }
          );
        }

        // Save Variants
        for (const variant of extractedVariants) {
          await Variant.findOneAndUpdate(
            { variantId: variant.variantId },
            variant,
            { upsert: true }
          );
        }
      }
    } else {
      // Direct array or different format fallback
      console.log('Unknown payload format, logging for review', JSON.stringify(payload).substring(0, 200));
    }

    res.status(200).json({ success: '1', message: 'Menu synced successfully' });
  } catch (error) {
    console.error('Menu Push Error:', error);
    res.status(500).json({ success: '0', message: error.message });
  }
});

// 2. ITEM OFF WEBHOOK
router.post('/item-off', async (req, res) => {
  try {
    const { itemid, variantid } = req.body; // Petpooja payload typically sends itemid
    if (itemid) {
      await MenuItem.findOneAndUpdate({ itemId: itemid }, { available: false });
    }
    res.status(200).json({ success: '1', message: 'Item marked as out of stock' });
  } catch (error) {
    console.error('Item Off Error:', error);
    res.status(500).json({ success: '0', message: error.message });
  }
});

// 3. ITEM ON WEBHOOK
router.post('/item-on', async (req, res) => {
  try {
    const { itemid, variantid } = req.body;
    if (itemid) {
      await MenuItem.findOneAndUpdate({ itemId: itemid }, { available: true });
    }
    res.status(200).json({ success: '1', message: 'Item marked as available' });
  } catch (error) {
    console.error('Item On Error:', error);
    res.status(500).json({ success: '0', message: error.message });
  }
});

// 4. GET STORE STATUS WEBHOOK
router.post('/get-store-status', (req, res) => {
  res.status(200).json({ status: storeStatus });
});

// 5. UPDATE STORE STATUS WEBHOOK
router.post('/update-store-status', (req, res) => {
  const { status } = req.body;
  if (status) {
    storeStatus = status; // OPEN, CLOSED, BUSY
  }
  res.status(200).json({ success: '1', message: 'Store status updated' });
});

// 6. ORDER STATUS CALLBACK
router.post('/order-status', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Received Petpooja Order Status Webhook:', JSON.stringify(payload));

    // Save raw payload to DB for debugging
    const mongoose = require('mongoose');
    const db = mongoose.connection;
    await db.collection('webhooklogs').insertOne({ 
      timestamp: new Date(), 
      type: 'order_status', 
      payload: payload 
    });

    // Petpooja typically sends orderID, status, clientOrderID
    // Handle multiple possible key formats
    const orderID = payload.orderID || payload.order_id || payload.orderid;
    const clientOrderID = payload.clientOrderID || payload.client_order_id || payload.clientorderid;
    const status = payload.status || payload.order_status || payload.orderstatus;
    
    if (clientOrderID || orderID) {
      const orderIdToFind = clientOrderID || orderID;
      
      // Map Petpooja numeric status to strings if necessary
      const statusMap = {
        "1": "placed",
        "2": "accepted",
        "3": "cancelled",
        "4": "dispatched",
        "5": "delivered",
        "6": "food ready",
        "7": "out for delivery"
      };

      let mappedStatus = status;
      if (statusMap[status]) {
        mappedStatus = statusMap[status];
      } else if (typeof status === 'string') {
        mappedStatus = status.toLowerCase();
      }

      console.log(`Searching for order: ${orderIdToFind} to update status to: ${mappedStatus}`);

      const order = await Order.findOneAndUpdate(
        { id: orderIdToFind },
        { status: mappedStatus || 'updated' },
        { returnDocument: 'after' }
      );

      if (order) {
        console.log(`✅ Found and updated order ${order.id}. New status: ${order.status}`);
        if (order.customerUid) {
          // 1. Sync to User's embedded order array
          const User = require('../models/User');
          await User.findOneAndUpdate(
            { uid: order.customerUid, "orders.id": order.id },
            { $set: { "orders.$.status": order.status } }
          );

          // 2. Emit Real-time update if io is available
          const io = req.app.get('socketio');
          if (io) {
            io.to(order.customerUid).emit('statusUpdate', {
              orderId: order.id,
              status: order.status
            });
            console.log(`📢 Emitted Petpooja status update to user: ${order.customerUid}`);
          }
        }
      } else {
        console.warn(`⚠️ Order with ID ${orderIdToFind} not found in DB.`);
      }
    } else {
      console.warn('⚠️ Petpooja status update missing orderID or clientOrderID', payload);
    }
    
    // Petpooja expects { "success": "1" } or similar
    res.status(200).json({ success: '1', message: 'Order status update processed' });
  } catch (error) {
    console.error('Order Status Callback Error:', error);
    res.status(500).json({ success: '0', message: error.message });
  }
});

// 7. INTERNAL ENDPOINT TO PLACE ORDER & RELAY TO PETPOOJA
router.post('/orders', async (req, res) => {
  try {
    const orderData = req.body;
    // Basic validation
    if (!orderData || !orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid order payload' });
    }

    // Save order locally first
    const newOrder = new Order(orderData);
    await newOrder.save();

    // Relay to Petpooja
    const petpoojaRes = await relayOrderToPetpooja(newOrder);

    res.status(200).json({ success: true, order: newOrder, petpoojaResponse: petpoojaRes });
  } catch (error) {
    console.error('Order Relay Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 8. UPDATE ORDER STATUS ON PETPOOJA (Admin/Website initiated cancellation)
router.post('/update-order-status', async (req, res) => {
  try {
    const { orderID, status, cancel_reason } = req.body;
    
    if (!orderID || !status) {
      return res.status(400).json({ success: false, message: 'Missing orderID or status' });
    }

    const payload = {
      app_key: process.env.PETPOOJA_APP_KEY,
      app_secret: process.env.PETPOOJA_APP_SECRET,
      access_token: process.env.PETPOOJA_ACCESS_TOKEN,
      restID: 'f871uxkp',
      orderID: orderID,
      status: status, // typically '7' for cancelled, etc. depending on Petpooja status codes
      cancel_reason: cancel_reason || 'Cancelled by user'
    };

    const updateUrl = process.env.PETPOOJA_UPDATE_ORDER_URL || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/update_order_status';
    const petpoojaRes = await axios.post(updateUrl, payload);
    
    // Update local DB as well
    await Order.findOneAndUpdate(
      { id: orderID },
      { status: 'cancelled' },
      { returnDocument: 'after' }
    );

    res.status(200).json({ success: true, message: 'Order status updated on Petpooja', response: petpoojaRes.data });
  } catch (error) {
    console.error('Update Order Status Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// CATCH-ALL FOR ANY UNHANDLED PETPOOJA WEBHOOKS
router.post('/:path*', async (req, res) => {
  console.log(`⚠️ Unhandled Petpooja Webhook on ${req.path}:`, JSON.stringify(req.body));
  const mongoose = require('mongoose');
  const db = mongoose.connection;
  await db.collection('webhooklogs').insertOne({ 
    timestamp: new Date(), 
    type: 'unhandled_webhook', 
    path: req.path,
    payload: req.body 
  });
  res.status(200).json({ success: '1', message: 'Logged' });
});

module.exports = router;

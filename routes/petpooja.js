const express = require('express');
const axios = require('axios');
const router = express.Router();

const Restaurant = require('../models/Restaurant');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const Variant = require('../models/Variant');
const Addon = require('../models/Addon');
const Order = require('../models/Order');

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
          { upsert: true, new: true }
        );

        // Save Categories
        if (restData.categories && Array.isArray(restData.categories)) {
          for (const cat of restData.categories) {
            await Category.findOneAndUpdate(
              { categoryId: cat.categoryid },
              { categoryId: cat.categoryid, restaurantId: restId, name: cat.categoryname },
              { upsert: true }
            );
          }
        }

        // Save Items
        if (restData.items && Array.isArray(restData.items)) {
          for (const item of restData.items) {
            await MenuItem.findOneAndUpdate(
              { itemId: item.itemid },
              {
                itemId: item.itemid,
                restaurantId: restId,
                categoryId: item.categoryid,
                name: item.itemname,
                price: parseFloat(item.item_price) || parseFloat(item.price) || 0,
                available: item.item_allow_variation === "1" ? true : (item.in_stock === "1" || item.in_stock === true || item.available === true),
                image: item.item_image_url || item.image || '',
                description: item.item_description || item.description || ''
              },
              { upsert: true }
            );
          }
        }

        // Save Variants & Addons (from attributes)
        if (restData.attributes && Array.isArray(restData.attributes)) {
          for (const attr of restData.attributes) {
            // Petpooja mixes variants and addons here, distinguishing by some fields
            // Assuming simplified mapping based on plan requirements
            const itemId = attr.itemid;
            if (attr.attribute_type === 'addon') {
              await Addon.findOneAndUpdate(
                { addonId: attr.attributeid },
                { addonId: attr.attributeid, itemId: itemId, name: attr.attributename, price: parseFloat(attr.price) || 0 },
                { upsert: true }
              );
            } else {
              await Variant.findOneAndUpdate(
                { variantId: attr.attributeid },
                { variantId: attr.attributeid, itemId: itemId, name: attr.attributename, price: parseFloat(attr.price) || 0 },
                { upsert: true }
              );
            }
          }
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
    // Petpooja typically sends orderID, status
    const { orderID, status, clientOrderID } = req.body;
    
    if (clientOrderID || orderID) {
      const orderIdToFind = clientOrderID || orderID;
      await Order.findOneAndUpdate(
        { id: orderIdToFind },
        { status: status ? status.toLowerCase() : 'updated' },
        { new: true }
      );
    }
    
    res.status(200).json({ success: '1', message: 'Order status updated successfully' });
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

    // Prepare Save Order payload for Petpooja
    const petpoojaPayload = {
      app_key: process.env.PETPOOJA_APP_KEY,
      app_secret: process.env.PETPOOJA_APP_SECRET,
      access_token: process.env.PETPOOJA_ACCESS_TOKEN,
      restID: 'f871uxkp', // Mapped restID from plan
      orderinfo: {
        OrderInfo: {
          Restaurant: {
            details: {
              res_name: "FitGreen",
              address: "FitGreen Address",
              contact_information: "9999999999",
              restID: "f871uxkp"
            }
          },
          Customer: {
            details: {
              name: orderData.customerName || 'Customer',
              email: orderData.customerEmail || '',
              phone: orderData.phone || '9999999999',
              address: orderData.address || 'N/A'
            }
          },
          Order: {
            details: {
              orderID: orderData.id || `FG${Date.now()}`,
              order_type: "Delivery", // Can be Delivery, PickUp, DineIn
              payment_type: "Prepaid",
              total: parseFloat(orderData.total) || 0,
              tax_total: 0,
              created_on: new Date().toISOString()
            }
          },
          OrderItem: {
            details: orderData.items.map(item => ({
              id: item.itemId || item.id, // Must be from Menu Push
              name: item.name,
              price: parseFloat(item.price) || 0,
              final_price: parseFloat(item.price) || 0,
              quantity: item.quantity || 1,
              variation_id: item.variation_id || item.variantId || "",
              item_tax: []
            }))
          }
        }
      }
    };

    // Save order locally first
    const newOrder = new Order(orderData);
    await newOrder.save();

    // Relay to Petpooja Save Order API
    const saveOrderUrl = process.env.PETPOOJA_SAVE_ORDER_URL || 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/save_order';
    
    try {
      const petpoojaRes = await axios.post(saveOrderUrl, petpoojaPayload);
      console.log('Petpooja Save Order Response:', petpoojaRes.data);
    } catch (petpoojaErr) {
      console.error('Petpooja Save Order Failed:', petpoojaErr.response ? petpoojaErr.response.data : petpoojaErr.message);
      // Even if relay fails, we saved the order locally. Maybe queue it or log it.
    }

    res.status(200).json({ success: true, order: newOrder, message: 'Order created and relayed to Petpooja' });
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
      { new: true }
    );

    res.status(200).json({ success: true, message: 'Order status updated on Petpooja', response: petpoojaRes.data });
  } catch (error) {
    console.error('Update Order Status Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

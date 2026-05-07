const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  customerName: { type: String },
  customerEmail: { type: String },
  customerUid: { type: String },
  items: [{
    id: { type: String },
    name: { type: String },
    price: { type: String },
    quantity: { type: Number },
    image: { type: String },
    type: { type: String },
    desc: { type: String },
    isCustom: { type: Boolean }
  }],
  total: { type: String },
  address: { type: String },
  city: { type: String },
  pinCode: { type: String },
  phone: { type: String },
  status: { type: String, default: 'pending' },
  razorpayOrderId: { type: String },
  razorpayPaymentId: { type: String },
  minimumPrepTime: { type: Number },
  minimumDeliveryTime: { type: Number },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

orderSchema.index({ customerUid: 1 });

module.exports = mongoose.model('Order', orderSchema);

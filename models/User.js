const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true },
  phone: { type: String },
  name: { type: String },
  email: { type: String },
  address: { type: String },
  pinCode: { type: String },
  city: { type: String },
  photo: { type: String },
  orders: [{
    id: { type: String },
    items: [{
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
    status: { type: String },
    minimumPrepTime: { type: Number },
    minimumDeliveryTime: { type: Number },
    date: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.index({ "orders.id": 1 });

module.exports = mongoose.model('User', userSchema);

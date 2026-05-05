const mongoose = require('mongoose');

const CorporateOrderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  numberOfPeople: { type: Number, required: true },
  deliveryDate: { type: String, required: true },
  deliveryTime: { type: String, required: true },
  requirements: { type: String },
  items: [{
    id: String,
    name: String,
    desc: String,
    price: String,
    image: String,
    type: { type: String },
    isCustom: Boolean,
    qty: Number
  }],
  status: { type: String, default: 'Pending' }
}, { timestamps: true });

module.exports = mongoose.model('CorporateOrder', CorporateOrderSchema);

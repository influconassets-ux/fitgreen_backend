const mongoose = require('mongoose');

const addonSchema = new mongoose.Schema({
  addonId: { type: String, required: true, unique: true },
  itemId: { type: String, required: true },
  name: { type: String },
  price: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('Addon', addonSchema);

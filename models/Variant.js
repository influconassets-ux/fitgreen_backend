const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  variantId: { type: String, required: true, unique: true },
  itemId: { type: String, required: true },
  name: { type: String },
  price: { type: Number }
}, { timestamps: true });

module.exports = mongoose.model('Variant', variantSchema);

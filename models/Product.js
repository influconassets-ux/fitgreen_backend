const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  desc: { type: String },
  price: { type: String, required: true },
  originalPrice: { type: String },
  img: { type: String },
  category: { type: String, enum: ['All', 'Bowls', 'Smoothies'], default: 'Bowls' },
  kcal: { type: String },
  protein: { type: String },
  carbs: { type: String },
  fat: { type: String },
  sugar: { type: String },
  isMostLoved: { type: Boolean, default: false },
  isSeasonal: { type: Boolean, default: false },
  outOfStock: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);

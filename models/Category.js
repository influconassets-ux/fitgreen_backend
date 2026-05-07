const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  petpoojaCategoryId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  sortOrder: { type: Number, default: 0 },
  restaurantId: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);


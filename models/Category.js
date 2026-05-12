const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  petpoojaCategoryId: { type: String, unique: true },
  name: { type: String, required: true },
  sortOrder: { type: Number, default: 0 },
  restaurantId: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);


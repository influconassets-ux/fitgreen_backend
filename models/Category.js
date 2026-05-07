const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  categoryId: { type: String, required: true, unique: true },
  restaurantId: { type: String, required: true },
  name: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Category', categorySchema);

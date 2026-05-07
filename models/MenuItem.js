const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  restaurantId: { type: String, required: true },
  categoryId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  available: { type: Boolean, default: true },
  image: { type: String },
  description: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', itemSchema);

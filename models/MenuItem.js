const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  restaurantId: { type: String, required: true },
  categoryId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  available: { type: Boolean, default: true },
  image: { type: String },
  description: { type: String },
  // Website specific extra fields
  category: { type: String }, // Local UI category mapping
  kcal: { type: String },
  protein: { type: String },
  carbs: { type: String },
  fat: { type: String },
  sugar: { type: String },
  isMostLoved: { type: Boolean, default: false },
  isSeasonal: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', itemSchema);

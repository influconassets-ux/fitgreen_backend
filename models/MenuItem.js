const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  petpoojaItemId: { type: String, unique: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
  petpoojaCategoryId: { type: String },
  available: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  
  // Extra fields for website
  restaurantId: { type: String },
  image: { type: String },
  description: { type: String },
  kcal: { type: String },
  protein: { type: String },
  carbs: { type: String },
  fat: { type: String },
  sugar: { type: String },
  isMostLoved: { type: Boolean, default: false },
  isSeasonal: { type: Boolean, default: false },
  isSmoothie: { type: Boolean, default: false },
  
  // For backward compatibility during migration
  itemId: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('MenuItem', itemSchema);


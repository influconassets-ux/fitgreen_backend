const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema({
  restaurantId: { type: String, required: true, unique: true },
  mappingCode: { type: String },
  restaurantName: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Restaurant', restaurantSchema);

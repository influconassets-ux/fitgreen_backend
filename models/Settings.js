const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  isStoreOpen: { type: Boolean, default: true },
  openingTime: { type: String, default: "6:00 AM" }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);

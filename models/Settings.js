const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  isStoreOpen: { type: Boolean, default: true },
  openingTime: { type: String, default: "12:00 PM" },
  manualCloseUntil: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);

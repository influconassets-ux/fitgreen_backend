const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  isStoreOpen: { type: Boolean, default: true },
  openingTime: { type: String, default: "12:00 PM" },
  manualCloseUntil: { type: Date, default: null },
  // Lets admin force the store open before the normal schedule's opening hour.
  // Only valid for the calendar day it was set (Asia/Kolkata) so it can't linger overnight.
  manualOpenOverride: { type: Boolean, default: false },
  manualOpenOverrideDate: { type: String, default: null },
  // Shown to customers in the "store closed" toast when they try to add to cart, e.g. "Closed for Puja holidays"
  closureReason: { type: String, default: null },
  // Shown to customers while the store is manually closed, e.g. "Closed for Puja holidays"
  closureReason: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);

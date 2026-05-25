const mongoose = require('mongoose');

const requestLogSchema = new mongoose.Schema({
  ip: { type: String, required: true },
  region: { type: String, default: 'Unknown' },
  country: { type: String, default: 'Unknown' },
  method: { type: String, required: true },
  url: { type: String, required: true },
  userAgent: { type: String },
  status: { type: Number },
  isBlocked: { type: Boolean, default: false },
  blockReason: { type: String }
}, { 
  timestamps: true 
});

// TTL Index: Delete logs older than 7 days automatically
requestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('RequestLog', requestLogSchema);

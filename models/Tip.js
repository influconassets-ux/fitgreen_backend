const mongoose = require('mongoose');

const TipSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
}, { timestamps: true });

module.exports = mongoose.model('Tip', TipSchema);

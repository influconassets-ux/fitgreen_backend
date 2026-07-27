const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  videoUrl: { type: String, required: true },
  posterUrl: { type: String },
  cloudinaryId: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Review', reviewSchema);

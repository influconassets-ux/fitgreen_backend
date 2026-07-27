const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['upcoming', 'recent'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  date: {
    type: String, // e.g. "18 April 2026"
    required: true
  },
  venue: {
    type: String, // e.g. "PowerHouse Gym, Kolkata"
    required: true
  },
  description: {
    type: String
  },
  
  // Specific to 'upcoming' events
  time: {
    type: String // e.g. "10:00 AM – 2:00 PM"
  },
  tags: [{
    type: String // e.g. "Fitness", "Pop-Up", "Sampling"
  }],
  coverPhotoUrl: {
    type: String
  },

  // Specific to 'recent' events
  thumbnailUrl: {
    type: String
  },
  galleryUrls: [{
    type: String
  }],
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Event', eventSchema);

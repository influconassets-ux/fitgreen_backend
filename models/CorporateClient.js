const mongoose = require('mongoose');

const CorporateClientSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  companyName: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('CorporateClient', CorporateClientSchema);

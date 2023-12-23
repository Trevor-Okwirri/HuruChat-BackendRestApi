// models/ResetToken.js
const mongoose = require('mongoose');

const resetTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  used: {
    type : Boolean,
    default: false
  },
  token: {
    type: String,
    required: true,
  },
  expiresAt: {
  type: Date,
  required: true,
  index: { expires: '1d' }, // Automatically expire documents after 1 day
  },
});

const ResetToken = mongoose.model('ResetToken', resetTokenSchema);

module.exports = ResetToken;


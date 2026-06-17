const mongoose = require('mongoose');

const snapSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  imageData: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  caption: {
    type: String,
    default: '',
    maxlength: 200
  },
  filters: [{
    type: String
  }],
  stickers: [{
    type: { type: String },
    x: Number,
    y: Number,
    data: String
  }],
  opened: {
    type: Boolean,
    default: false
  },
  openedAt: {
    type: Date
  },
  screenshotted: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    default: function() {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days if unopened
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Snap', snapSchema);
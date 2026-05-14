// Notification model — stores all in-app notifications
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    // Type helps the frontend decide icon/color
    type: {
      type: String,
      enum: ['reminder', 'missed', 'alert', 'info', 'ai'],
      default: 'info',
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    // Optional reference to a specific medicine
    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);

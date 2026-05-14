// Chat model — stores persistent chat history between a user and MediSync AI
// Also tracks conversational scheduling state for smart context memory across turns
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    from: {
      type: String,
      enum: ['user', 'ai'],
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
      unique: true, // One chat history document per user containing their message stream
    },
    messages: [messageSchema],
    
    // Persistent conversational memory for multi-turn medicine scheduling
    schedulingState: {
      active: { type: Boolean, default: false },
      medicineName: { type: String, default: '' },
      dosage: { type: String, default: '' },
      timing: { type: [String], default: [] },
      duration: { type: Number, default: null },
      step: { type: String, default: '' }, // e.g. 'ask_dosage', 'ask_timing', 'ask_duration'
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Chat', chatSchema);

// AdherenceLog — records every taken/missed/skipped dose event
const mongoose = require('mongoose');

const adherenceLogSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    medicineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Medicine',
      required: true,
    },

    // Status of this dose
    status: {
      type: String,
      enum: ['taken', 'missed', 'skipped'],
      required: true,
    },

    // When the patient actually took (or missed) the medicine
    takenAt: {
      type: Date,
      default: null, // null means it was not taken
    },

    // The time this dose was scheduled for, e.g. "08:00"
    scheduledTime: {
      type: String,
      required: true,
    },

    // The calendar date for which this log belongs (normalized to YYYY-MM-DD)
    scheduledDate: {
      type: Date,
      required: true,
    },

    // Notes from patient ("felt nauseous", etc.)
    notes: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate logs for same medicine + time + date
adherenceLogSchema.index(
  { medicineId: 1, scheduledDate: 1, scheduledTime: 1 },
  { unique: true }
);

module.exports = mongoose.model('AdherenceLog', adherenceLogSchema);

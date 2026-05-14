// Medicine model — tracks a patient's prescription/medicine schedule
const mongoose = require('mongoose');

const medicineSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    medicineName: {
      type: String,
      required: [true, 'Medicine name is required'],
      trim: true,
    },

    dosage: {
      type: String, // e.g. "500mg", "1 tablet"
      required: [true, 'Dosage is required'],
    },

    // Times during the day to take the medicine, e.g. ["08:00", "14:00", "20:00"]
    timing: {
      type: [String],
      required: [true, 'At least one timing is required'],
    },

    // How many days to take this medicine
    duration: {
      type: Number, // in days
      required: true,
    },

    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    endDate: {
      type: Date,
      required: true,
    },

    reminderEnabled: {
      type: Boolean,
      default: true,
    },

    // active | completed | paused
    status: {
      type: String,
      enum: ['active', 'completed', 'paused'],
      default: 'active',
    },

    // Optional notes from doctor or patient
    notes: {
      type: String,
      default: '',
    },

    // Was this added via OCR? helps analytics
    addedViaOCR: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Auto-compute endDate from startDate + duration if not provided
medicineSchema.pre('save', async function () {
  if (this.startDate && this.duration && !this.endDate) {
    const end = new Date(this.startDate);
    end.setDate(end.getDate() + this.duration);
    this.endDate = end;
  }
});

module.exports = mongoose.model('Medicine', medicineSchema);

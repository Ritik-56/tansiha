// CaregiverPatientLink — links a caretaker to one or more patients
const mongoose = require('mongoose');

const caregiverPatientLinkSchema = new mongoose.Schema(
  {
    caretakerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // pending | accepted | rejected
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },

    // Optional label (e.g. "Father", "Client #3")
    label: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// A caretaker cannot be linked to the same patient twice
caregiverPatientLinkSchema.index(
  { caretakerId: 1, patientId: 1 },
  { unique: true }
);

module.exports = mongoose.model('CaregiverPatientLink', caregiverPatientLinkSchema);

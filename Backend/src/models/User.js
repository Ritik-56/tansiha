// User model — supports both Patient and Caretaker roles
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    // Auto-generated unique ID, e.g. PAT-48392 or CRT-29483
    userId: {
      type: String,
      unique: true,
    },

    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false, // Never return password in queries by default
    },

    role: {
      type: String,
      enum: ['patient', 'caretaker'],
      required: true,
    },

    // ── Patient-specific fields ──────────────────────────────────────────────
    age: { type: Number },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    medicalHistory: {
      conditions: [{ type: String }],
      allergies: [{ type: String }],
      medications: [{ type: String }],
      notes: { type: String, default: '' }
    },
    emergencyContact: {
      name: { type: String },
      phone: { type: String },
      relation: { type: String },
    },

    // ── Caretaker-specific fields ────────────────────────────────────────────
    relationship: { type: String }, // e.g. "spouse", "child", "nurse"

    // ── Push notifications (FCM) ─────────────────────────────────────────────
    fcmToken: { type: String, default: null },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// ── Pre-save hooks ────────────────────────────────────────────────────────────

// Generate unique userId before saving new user
userSchema.pre('save', async function () {
  // Generate userId only on first save
  if (!this.userId) {
    const prefix = this.role === 'patient' ? 'PAT' : 'CRT';
    const randomNum = Math.floor(10000 + Math.random() * 90000);
    this.userId = `${prefix}-${randomNum}`;
  }

  // Hash password only if it was modified
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);

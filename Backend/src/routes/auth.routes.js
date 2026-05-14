// Auth routes
const express = require('express');
const router = express.Router();

const {
  registerPatient,
  registerCaretaker,
  login,
  logout,
  getMe,
  updateFCMToken,
} = require('../controllers/auth.controller');

const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  registerPatientRules,
  registerCaretakerRules,
  loginRules,
} = require('../validators/auth.validator');

// POST /api/auth/register/patient
router.post('/register/patient', registerPatientRules, validate, registerPatient);

// POST /api/auth/register/caretaker
router.post('/register/caretaker', registerCaretakerRules, validate, registerCaretaker);

// POST /api/auth/login
router.post('/login', loginRules, validate, login);

// POST /api/auth/logout
router.post('/logout', protect, logout);

// GET /api/auth/me
router.get('/me', protect, getMe);

// PATCH /api/auth/fcm-token
router.patch('/fcm-token', protect, updateFCMToken);

module.exports = router;

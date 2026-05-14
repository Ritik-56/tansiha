// AI routes — symptom chat, adherence suggestions, medicine explanation, chat-to-schedule
const express = require('express');
const router = express.Router();

const { chat, confirmSchedule, getAdherenceSuggestion, explainMedicine, getChatHistory } = require('../controllers/ai.controller');
const { protect } = require('../middleware/auth');
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');

router.use(protect);

// GET /api/ai/history — fetch persistent conversation history for the authenticated user
router.get('/history', getChatHistory);

// POST /api/ai/chat — symptom guidance chat (with optional schedule extraction)
router.post(
  '/chat',
  [body('message').trim().notEmpty().withMessage('Message is required')],
  validate,
  chat
);

// POST /api/ai/confirm-schedule — save AI-suggested medicine schedule
// Called after user confirms the chat-to-schedule suggestion
router.post(
  '/confirm-schedule',
  [body('medicines').isArray({ min: 1 }).withMessage('Medicines array is required')],
  validate,
  confirmSchedule
);

// POST /api/ai/adherence-suggestion
router.post('/adherence-suggestion', getAdherenceSuggestion);

// POST /api/ai/explain-medicine
router.post(
  '/explain-medicine',
  [body('medicineName').trim().notEmpty().withMessage('Medicine name is required')],
  validate,
  explainMedicine
);

module.exports = router;

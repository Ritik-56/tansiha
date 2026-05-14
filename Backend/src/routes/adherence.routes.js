// Adherence routes
const express = require('express');
const router = express.Router();

const { getLogs, getAdherenceStats, getDailyBreakdown } = require('../controllers/adherence.controller');
const { protect } = require('../middleware/auth');

router.use(protect);

// GET /api/adherence/logs
router.get('/logs', getLogs);

// GET /api/adherence/stats
router.get('/stats', getAdherenceStats);

// GET /api/adherence/daily-breakdown
router.get('/daily-breakdown', getDailyBreakdown);

module.exports = router;

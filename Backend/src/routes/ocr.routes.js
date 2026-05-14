// OCR routes — prescription image upload and text extraction
const express = require('express');
const router = express.Router();

const { extractFromPrescription } = require('../controllers/ocr.controller');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../config/multer');

// POST /api/ocr/extract
// Only patients can upload prescriptions
router.post(
  '/extract',
  protect,
  authorize('patient'),
  upload.single('prescription'), // field name must be "prescription"
  extractFromPrescription
);

module.exports = router;

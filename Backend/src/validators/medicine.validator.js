// Validation rules for medicine routes
const { body } = require('express-validator');

const addMedicineRules = [
  body('medicineName').trim().notEmpty().withMessage('Medicine name is required'),
  body('dosage').trim().notEmpty().withMessage('Dosage is required'),
  body('timing')
    .isArray({ min: 1 }).withMessage('At least one timing is required')
    .custom((timings) => {
      const timeRegex = /^([0-1]\d|2[0-3]):([0-5]\d)$/;
      return timings.every((t) => timeRegex.test(t));
    })
    .withMessage('Timings must be in HH:mm format (e.g. "08:00")'),
  body('duration')
    .isInt({ min: 1 }).withMessage('Duration must be at least 1 day'),
  body('startDate')
    .isISO8601().withMessage('Start date must be a valid ISO date'),
];

const updateMedicineRules = [
  body('medicineName').optional().trim().notEmpty().withMessage('Medicine name cannot be empty'),
  body('dosage').optional().trim().notEmpty().withMessage('Dosage cannot be empty'),
  body('timing')
    .optional()
    .isArray({ min: 1 }).withMessage('At least one timing is required'),
  body('status')
    .optional()
    .isIn(['active', 'completed', 'paused']).withMessage('Invalid status'),
];

module.exports = { addMedicineRules, updateMedicineRules };

// Validation rules for auth routes
const { body } = require('express-validator');

const registerPatientRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .custom((value) => {
      const cleaned = value.replace(/\D/g, '');
      if (cleaned.length < 10 || cleaned.length > 15) {
        throw new Error('Phone number must be between 10 and 15 digits');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('age')
    .optional()
    .isInt({ min: 1, max: 120 }).withMessage('Age must be a valid number'),
  body('gender')
    .optional()
    .isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
];

const registerCaretakerRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .custom((value) => {
      const cleaned = value.replace(/\D/g, '');
      if (cleaned.length < 10 || cleaned.length > 15) {
        throw new Error('Phone number must be between 10 and 15 digits');
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('relationship')
    .trim()
    .notEmpty().withMessage('Relationship is required (e.g. spouse, child)'),
];

const loginRules = [
  body('identifier').trim().notEmpty().withMessage('Email or Phone number is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

module.exports = { registerPatientRules, registerCaretakerRules, loginRules };

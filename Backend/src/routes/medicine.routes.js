// Medicine routes
const express = require('express');
const router = express.Router();

const {
  addMedicine,
  getMedicines,
  getTodayMedicines,
  getMedicineById,
  updateMedicine,
  deleteMedicine,
  markAsTaken,
  markAsMissed,
} = require('../controllers/medicine.controller');

const { protect, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { addMedicineRules, updateMedicineRules } = require('../validators/medicine.validator');

// All medicine routes require authentication
router.use(protect);

// GET  /api/medicines/today — Get today's active medicines
router.get('/today', getTodayMedicines);

// GET  /api/medicines
// POST /api/medicines
router.route('/')
  .get(getMedicines)
  .post(authorize('patient', 'caretaker'), addMedicineRules, validate, addMedicine);

// GET    /api/medicines/:id
// PUT    /api/medicines/:id
// DELETE /api/medicines/:id
router.route('/:id')
  .get(getMedicineById)
  .put(authorize('patient', 'caretaker'), updateMedicineRules, validate, updateMedicine)
  .delete(authorize('patient', 'caretaker'), deleteMedicine);

// POST /api/medicines/:id/taken
router.post('/:id/taken', authorize('patient', 'caretaker'), markAsTaken);

// POST /api/medicines/:id/missed
router.post('/:id/missed', authorize('patient', 'caretaker'), markAsMissed);

module.exports = router;

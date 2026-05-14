// Caretaker routes
const express = require('express');
const router = express.Router();

const {
  linkPatient,
  respondToLink,
  getMyPatients,
  getPendingLinks,
  getPatientAdherenceOverview,
  unlinkPatient,
} = require('../controllers/caretaker.controller');

const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// POST /api/caretaker/link — caretaker sends a link request
router.post('/link', authorize('caretaker'), linkPatient);

// GET /api/caretaker/patients — caretaker views their linked patients
router.get('/patients', authorize('caretaker'), getMyPatients);

// GET /api/caretaker/pending-links — patient views pending link requests
router.get('/pending-links', authorize('patient'), getPendingLinks);

// PATCH /api/caretaker/link/:linkId/respond — patient accepts/rejects
router.patch('/link/:linkId/respond', authorize('patient'), respondToLink);

// GET /api/caretaker/patients/:patientId/overview — caretaker views patient adherence
router.get('/patients/:patientId/overview', authorize('caretaker'), getPatientAdherenceOverview);

// DELETE /api/caretaker/link/:linkId — either party can unlink
router.delete('/link/:linkId', unlinkPatient);

module.exports = router;

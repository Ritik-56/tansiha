// Medicine Controller — CRUD + today's medicines + mark taken/missed
const Medicine = require('../models/Medicine');
const AdherenceLog = require('../models/AdherenceLog');
const CaregiverPatientLink = require('../models/CaregiverPatientLink');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');
const { startOfDay, endOfDay } = require('date-fns');

// Helper to verify if the user has authorization for a target patient ID
const verifyPatientAccess = async (user, targetPatientId) => {
  if (!targetPatientId) return false;
  if (user.role === 'patient') {
    return user._id.toString() === targetPatientId.toString();
  }
  if (user.role === 'caretaker') {
    const link = await CaregiverPatientLink.findOne({
      caretakerId: user._id,
      patientId: targetPatientId,
      status: 'accepted',
    });
    return !!link;
  }
  return false;
};

// ─── Add Medicine ─────────────────────────────────────────────────────────────
const addMedicine = async (req, res, next) => {
  try {
    const { medicineName, dosage, timing, duration, startDate, reminderEnabled, notes, patientId } = req.body;
    const targetPatientId = patientId || req.user._id;

    const hasAccess = await verifyPatientAccess(req.user, targetPatientId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    const start = new Date(startDate);
    const end = new Date(startDate);
    end.setDate(end.getDate() + Number(duration));

    const medicine = await Medicine.create({
      patientId: targetPatientId,
      medicineName,
      dosage,
      timing,
      duration,
      startDate: start,
      endDate: end,
      reminderEnabled: reminderEnabled !== undefined ? reminderEnabled : true,
      notes,
    });

    return sendCreated(res, { medicine }, 'Medicine added successfully');
  } catch (err) {
    next(err);
  }
};

// ─── Get All Medicines for patient ───────────────────────────────────────────
const getMedicines = async (req, res, next) => {
  try {
    const targetPatientId = req.query.patientId || req.user._id;
    const hasAccess = await verifyPatientAccess(req.user, targetPatientId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    const { status } = req.query;
    const filter = { patientId: targetPatientId };
    if (status) filter.status = status;

    const medicines = await Medicine.find(filter).sort({ createdAt: -1 });
    return sendSuccess(res, { medicines, count: medicines.length });
  } catch (err) {
    next(err);
  }
};

// ─── Get Today's Active Medicines ─────────────────────────────────────────────
const getTodayMedicines = async (req, res, next) => {
  try {
    const targetPatientId = req.query.patientId || req.user._id;
    const hasAccess = await verifyPatientAccess(req.user, targetPatientId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    const today = new Date();

    const medicines = await Medicine.find({
      patientId: targetPatientId,
      status: 'active',
      startDate: { $lte: endOfDay(today) },
      endDate: { $gte: startOfDay(today) },
    });

    // Attach today's adherence logs to each medicine
    const enriched = await Promise.all(
      medicines.map(async (med) => {
        const logs = await AdherenceLog.find({
          medicineId: med._id,
          scheduledDate: {
            $gte: startOfDay(today),
            $lte: endOfDay(today),
          },
        });
        return { ...med.toObject(), todayLogs: logs };
      })
    );

    return sendSuccess(res, { medicines: enriched, count: enriched.length });
  } catch (err) {
    next(err);
  }
};

// ─── Get Single Medicine ──────────────────────────────────────────────────────
const getMedicineById = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return sendError(res, 'Medicine not found', 404);

    const hasAccess = await verifyPatientAccess(req.user, medicine.patientId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    return sendSuccess(res, { medicine });
  } catch (err) {
    next(err);
  }
};

// ─── Update Medicine ──────────────────────────────────────────────────────────
const updateMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return sendError(res, 'Medicine not found', 404);

    const hasAccess = await verifyPatientAccess(req.user, medicine.patientId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    const updated = await Medicine.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    return sendSuccess(res, { medicine: updated }, 'Medicine updated');
  } catch (err) {
    next(err);
  }
};

// ─── Delete Medicine ──────────────────────────────────────────────────────────
const deleteMedicine = async (req, res, next) => {
  try {
    const medicine = await Medicine.findById(req.params.id);
    if (!medicine) return sendError(res, 'Medicine not found', 404);

    const hasAccess = await verifyPatientAccess(req.user, medicine.patientId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    await medicine.deleteOne();
    await AdherenceLog.deleteMany({ medicineId: req.params.id });

    return sendSuccess(res, {}, 'Medicine deleted');
  } catch (err) {
    next(err);
  }
};

// ─── Mark Medicine as Taken ───────────────────────────────────────────────────
const markAsTaken = async (req, res, next) => {
  try {
    const { scheduledTime, scheduledDate, notes } = req.body;
    const { id: medicineId } = req.params;

    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return sendError(res, 'Medicine not found', 404);

    const hasAccess = await verifyPatientAccess(req.user, medicine.patientId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    const date = scheduledDate ? new Date(scheduledDate) : new Date();

    const log = await AdherenceLog.findOneAndUpdate(
      {
        medicineId,
        patientId: medicine.patientId,
        scheduledDate: startOfDay(date),
        scheduledTime,
      },
      {
        status: 'taken',
        takenAt: new Date(),
        notes: notes || '',
      },
      { upsert: true, new: true }
    );

    return sendSuccess(res, { log }, 'Medicine marked as taken ✅');
  } catch (err) {
    next(err);
  }
};

// ─── Mark Medicine as Missed ──────────────────────────────────────────────────
const markAsMissed = async (req, res, next) => {
  try {
    const { scheduledTime, scheduledDate } = req.body;
    const { id: medicineId } = req.params;

    const medicine = await Medicine.findById(medicineId);
    if (!medicine) return sendError(res, 'Medicine not found', 404);

    const hasAccess = await verifyPatientAccess(req.user, medicine.patientId);
    if (!hasAccess) return sendError(res, 'Access denied to this patient profile', 403);

    const date = scheduledDate ? new Date(scheduledDate) : new Date();

    const log = await AdherenceLog.findOneAndUpdate(
      {
        medicineId,
        patientId: medicine.patientId,
        scheduledDate: startOfDay(date),
        scheduledTime,
      },
      { status: 'missed', takenAt: null },
      { upsert: true, new: true }
    );

    return sendSuccess(res, { log }, 'Medicine marked as missed ❌');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  addMedicine,
  getMedicines,
  getTodayMedicines,
  getMedicineById,
  updateMedicine,
  deleteMedicine,
  markAsTaken,
  markAsMissed,
};

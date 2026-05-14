// Caretaker Controller — link management, patient overview, alert system
const CaregiverPatientLink = require('../models/CaregiverPatientLink');
const User = require('../models/User');
const AdherenceLog = require('../models/AdherenceLog');
const Medicine = require('../models/Medicine');
const { sendSuccess, sendError, sendCreated } = require('../utils/response');
const { startOfDay, endOfDay, subDays } = require('date-fns');

// ─── Link caretaker to a patient ─────────────────────────────────────────────
// Caretaker sends a link request using patient's unique ID (userId) or phone
const linkPatient = async (req, res, next) => {
  try {
    const { patientId, patientPhone, label } = req.body;

    if (!patientId && !patientPhone) {
      return sendError(res, 'Patient unique ID or phone is required', 400);
    }

    // Build search query
    const query = { role: 'patient' };
    if (patientId) {
      query.userId = patientId.trim();
    } else {
      query.phone = patientPhone.trim();
    }

    // Find the patient
    const patient = await User.findOne(query);
    if (!patient) {
      return sendError(res, 'No patient found with this unique ID or phone number', 404);
    }

    if (patient._id.toString() === req.user._id.toString()) {
      return sendError(res, 'You cannot link yourself', 400);
    }

    // Check if link already exists
    let link = await CaregiverPatientLink.findOne({
      caretakerId: req.user._id,
      patientId: patient._id,
    });

    // If linking by unique ID, let's auto-accept so the caretaker dashboard works instantly
    const targetStatus = patientId ? 'accepted' : 'pending';

    if (link) {
      if (link.status !== targetStatus) {
        link.status = targetStatus;
        if (label) link.label = label;
        await link.save();
        return sendSuccess(res, { link }, `Patient linked successfully`);
      }
      return sendError(res, 'You are already linked to this patient', 409);
    }

    // Create link
    link = await CaregiverPatientLink.create({
      caretakerId: req.user._id,
      patientId: patient._id,
      label: label || '',
      status: targetStatus,
    });

    const msg = targetStatus === 'accepted' ? 'Patient linked successfully' : 'Link request sent to patient';
    return sendCreated(res, { link }, msg);
  } catch (err) {
    if (err.code === 11000) {
      return sendError(res, 'You are already linked to this patient', 409);
    }
    next(err);
  }
};

// ─── Patient accepts/rejects a link request ───────────────────────────────────
const respondToLink = async (req, res, next) => {
  try {
    const { linkId } = req.params;
    const { action } = req.body; // 'accept' | 'reject'

    if (!['accept', 'reject'].includes(action)) {
      return sendError(res, 'Action must be "accept" or "reject"', 400);
    }

    const link = await CaregiverPatientLink.findById(linkId);
    if (!link) return sendError(res, 'Link not found', 404);

    // Only the patient can respond
    if (link.patientId.toString() !== req.user._id.toString()) {
      return sendError(res, 'Access denied', 403);
    }

    link.status = action === 'accept' ? 'accepted' : 'rejected';
    await link.save();

    return sendSuccess(res, { link }, `Link ${link.status}`);
  } catch (err) {
    next(err);
  }
};

// ─── Get all patients for a caretaker ────────────────────────────────────────
const getMyPatients = async (req, res, next) => {
  try {
    const links = await CaregiverPatientLink.find({
      caretakerId: req.user._id,
      status: 'accepted',
    }).populate('patientId', 'fullName phone userId age gender medicalHistory');

    const today = new Date();
    const sevenDaysAgo = subDays(today, 6);

    const patients = [];
    for (const l of links) {
      if (!l.patientId) continue;
      const pId = l.patientId._id;

      // Fetch last 7 days logs to compute adherence % and current status
      const logs = await AdherenceLog.find({
        patientId: pId,
        scheduledDate: { $gte: startOfDay(sevenDaysAgo), $lte: endOfDay(today) },
      });

      const total = logs.length;
      const taken = logs.filter((log) => log.status === 'taken').length;
      const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

      const todayMissed = logs.some(
        (log) =>
          log.status === 'missed' &&
          new Date(log.scheduledDate) >= startOfDay(today)
      );

      const status = todayMissed ? 'Needs Attention' : 'Stable';

      patients.push({
        linkId: l._id,
        label: l.label,
        patient: l.patientId,
        adherenceRate,
        status,
        linkedAt: l.updatedAt,
      });
    }

    return sendSuccess(res, { patients, count: patients.length });
  } catch (err) {
    next(err);
  }
};

// ─── Get pending link requests for a patient ──────────────────────────────────
const getPendingLinks = async (req, res, next) => {
  try {
    const links = await CaregiverPatientLink.find({
      patientId: req.user._id,
      status: 'pending',
    }).populate('caretakerId', 'fullName phone userId relationship');

    return sendSuccess(res, { links, count: links.length });
  } catch (err) {
    next(err);
  }
};

// ─── Adherence overview of a specific patient (for caretaker) ─────────────────
const getPatientAdherenceOverview = async (req, res, next) => {
  try {
    const { patientId } = req.params;

    // Verify caretaker is actually linked
    const link = await CaregiverPatientLink.findOne({
      caretakerId: req.user._id,
      patientId,
      status: 'accepted',
    });
    if (!link) return sendError(res, 'You are not linked to this patient', 403);

    const today = new Date();
    const sevenDaysAgo = subDays(today, 6);

    // Fetch active medicines
    const medicines = await Medicine.find({ patientId, status: 'active' });

    // Fetch last 7 days logs
    const logs = await AdherenceLog.find({
      patientId,
      scheduledDate: { $gte: startOfDay(sevenDaysAgo), $lte: endOfDay(today) },
    }).populate('medicineId', 'medicineName dosage');

    const total = logs.length;
    const taken = logs.filter((l) => l.status === 'taken').length;
    const missed = logs.filter((l) => l.status === 'missed').length;
    const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 0;

    // Find today's missed doses for alert
    const todayMissed = logs.filter(
      (l) =>
        l.status === 'missed' &&
        new Date(l.scheduledDate) >= startOfDay(today)
    );

    return sendSuccess(res, {
      adherenceRate,
      total,
      taken,
      missed,
      activeMedicines: medicines.length,
      todayMissedDoses: todayMissed,
      recentLogs: logs.slice(0, 10),
    });
  } catch (err) {
    next(err);
  }
};

// ─── Unlink a patient ─────────────────────────────────────────────────────────
const unlinkPatient = async (req, res, next) => {
  try {
    const { linkId } = req.params;
    const link = await CaregiverPatientLink.findById(linkId);

    if (!link) return sendError(res, 'Link not found', 404);

    const isOwner =
      link.caretakerId.toString() === req.user._id.toString() ||
      link.patientId.toString() === req.user._id.toString();

    if (!isOwner) return sendError(res, 'Access denied', 403);

    await link.deleteOne();
    return sendSuccess(res, {}, 'Unlinked successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  linkPatient,
  respondToLink,
  getMyPatients,
  getPendingLinks,
  getPatientAdherenceOverview,
  unlinkPatient,
};

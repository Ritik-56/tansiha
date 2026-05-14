// Adherence Controller — logs, stats, and overview per patient
const AdherenceLog = require('../models/AdherenceLog');
const Medicine = require('../models/Medicine');
const { sendSuccess, sendError } = require('../utils/response');
const { startOfDay, endOfDay, subDays, format } = require('date-fns');

// ─── Get Adherence Logs (filterable by date range) ────────────────────────────
const getLogs = async (req, res, next) => {
  try {
    const patientId = req.query.patientId || req.user._id;
    const { from, to, medicineId } = req.query;

    const filter = { patientId };
    if (medicineId) filter.medicineId = medicineId;
    if (from || to) {
      filter.scheduledDate = {};
      if (from) filter.scheduledDate.$gte = startOfDay(new Date(from));
      if (to) filter.scheduledDate.$lte = endOfDay(new Date(to));
    }

    const logs = await AdherenceLog.find(filter)
      .populate('medicineId', 'medicineName dosage')
      .sort({ scheduledDate: -1 });

    return sendSuccess(res, { logs, count: logs.length });
  } catch (err) {
    next(err);
  }
};

// ─── Get Adherence Stats (last N days) ───────────────────────────────────────
const getAdherenceStats = async (req, res, next) => {
  try {
    const patientId = req.query.patientId || req.user._id;
    const days = parseInt(req.query.days) || 7;

    const fromDate = startOfDay(subDays(new Date(), days - 1));
    const toDate = endOfDay(new Date());

    const logs = await AdherenceLog.find({
      patientId,
      scheduledDate: { $gte: fromDate, $lte: toDate },
    });

    const total = logs.length;
    const taken = logs.filter((l) => l.status === 'taken').length;
    const missed = logs.filter((l) => l.status === 'missed').length;
    const skipped = logs.filter((l) => l.status === 'skipped').length;
    const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 0;

    return sendSuccess(res, {
      total,
      taken,
      missed,
      skipped,
      adherenceRate,
      period: `Last ${days} days`,
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get Daily Breakdown (for charts) ─────────────────────────────────────────
const getDailyBreakdown = async (req, res, next) => {
  try {
    const patientId = req.query.patientId || req.user._id;
    const days = parseInt(req.query.days) || 7;

    const breakdown = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const logs = await AdherenceLog.find({
        patientId,
        scheduledDate: {
          $gte: startOfDay(date),
          $lte: endOfDay(date),
        },
      });

      const total = logs.length;
      const taken = logs.filter((l) => l.status === 'taken').length;

      breakdown.push({
        date: format(date, 'yyyy-MM-dd'),
        label: format(date, 'EEE'),
        total,
        taken,
        missed: logs.filter((l) => l.status === 'missed').length,
        adherenceRate: total > 0 ? Math.round((taken / total) * 100) : 0,
      });
    }

    return sendSuccess(res, { breakdown });
  } catch (err) {
    next(err);
  }
};

module.exports = { getLogs, getAdherenceStats, getDailyBreakdown };

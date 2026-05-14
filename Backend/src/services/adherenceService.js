/**
 * Adherence Service — core business logic for adherence calculations,
 * missed dose detection, and reminder scheduling checks.
 *
 * Used by both the cron job and the controller layer.
 */

const Medicine = require('../models/Medicine');
const AdherenceLog = require('../models/AdherenceLog');
const User = require('../models/User');
const CaregiverPatientLink = require('../models/CaregiverPatientLink');
const { notifyReminder, notifyMissedDose } = require('../notifications/notificationService');
const { sendReminderSMS, sendMissedDoseAlertSMS, sendMissedDoseSMS } = require('./smsService');
const { startOfDay, endOfDay, format, subMinutes, addMinutes } = require('date-fns');

/**
 * Get all active medicines whose reminder time matches NOW (within ±2 min window).
 * Called every minute by the cron job.
 */
const getUpcomingReminders = async () => {
  const now = new Date();
  const currentTime = format(now, 'HH:mm');

  // Get all active medicines with reminders enabled
  const medicines = await Medicine.find({
    status: 'active',
    reminderEnabled: true,
    startDate: { $lte: endOfDay(now) },
    endDate: { $gte: startOfDay(now) },
  }).populate('patientId');

  const due = [];

  for (const medicine of medicines) {
    for (const scheduledTime of medicine.timing) {
      // Check if current time matches the scheduled time (exact HH:mm match)
      if (scheduledTime === currentTime) {
        // Check if we already fired this reminder today
        const alreadyLogged = await AdherenceLog.findOne({
          medicineId: medicine._id,
          scheduledDate: startOfDay(now),
          scheduledTime,
        });

        if (!alreadyLogged) {
          due.push({ medicine, scheduledTime });
        }
      }
    }
  }

  return due;
};

/**
 * Fire reminders for all due medicines at the current minute.
 * Sends in-app notification + push + SMS.
 */
const fireReminders = async () => {
  const due = await getUpcomingReminders();

  if (due.length === 0) return;

  console.log(`🔔 Firing ${due.length} reminder(s)...`);

  for (const { medicine, scheduledTime } of due) {
    const patient = medicine.patientId;
    if (!patient) continue;

    // Trigger push notification immediately at reminder time
    await notifyReminder(patient, medicine, scheduledTime);

    // Escalate to SMS reminder if no action taken after threshold
    if (patient.phone) {
      setTimeout(async () => {
        try {
          // Check if patient marked the medicine as taken or skipped
          const actionLog = await AdherenceLog.findOne({
            medicineId: medicine._id,
            scheduledDate: startOfDay(new Date()),
            scheduledTime,
          });

          // If no log exists after threshold window, trigger reminder SMS
          if (!actionLog || actionLog.status === 'missed') {
            console.log(`⏱️ Threshold exceeded without action for ${medicine.medicineName}. Escalating to SMS reminder.`);
            await sendReminderSMS(patient.phone, medicine.medicineName, medicine.dosage, scheduledTime);
          }
        } catch (err) {
          console.error('❌ Delayed SMS threshold check error:', err.message);
        }
      }, 5 * 60 * 1000); // 5 minutes non-blocking threshold window
    }
  }
};

/**
 * Detect missed doses — runs once per hour.
 * A dose is "missed" if its scheduled time was >30 min ago and no log exists.
 */
const detectMissedDoses = async () => {
  const now = new Date();
  const today = startOfDay(now);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  const medicines = await Medicine.find({
    status: 'active',
    startDate: { $lte: endOfDay(now) },
    endDate: { $gte: today },
  }).populate('patientId');

  console.log(`🔍 Checking missed doses for ${medicines.length} active medicine(s)...`);

  for (const medicine of medicines) {
    for (const scheduledTime of medicine.timing) {
      const [schedHour, schedMin] = scheduledTime.split(':').map(Number);

      // Skip future doses
      const minutesSinceScheduled =
        (currentHour - schedHour) * 60 + (currentMinute - schedMin);
      if (minutesSinceScheduled < 30) continue; // Give 30 min grace period

      // Check if already logged (taken, missed, or skipped)
      const existingLog = await AdherenceLog.findOne({
        medicineId: medicine._id,
        scheduledDate: today,
        scheduledTime,
      });

      if (!existingLog) {
        // Create missed log
        await AdherenceLog.create({
          patientId: medicine.patientId._id,
          medicineId: medicine._id,
          status: 'missed',
          scheduledTime,
          scheduledDate: today,
          takenAt: null,
        });

        console.log(`❌ Missed dose logged: ${medicine.medicineName} at ${scheduledTime}`);

        // Trigger Missed Dose SMS to patient directly
        if (medicine.patientId.phone) {
          await sendMissedDoseSMS(medicine.patientId.phone);
        }

        // Alert all linked caretakers
        const links = await CaregiverPatientLink.find({
          patientId: medicine.patientId._id,
          status: 'accepted',
        }).populate('caretakerId');

        for (const link of links) {
          const caretaker = link.caretakerId;
          if (!caretaker) continue;

          await notifyMissedDose(caretaker, medicine.patientId, medicine);

          // SMS alert to caretaker
          if (caretaker.phone) {
            await sendMissedDoseAlertSMS(caretaker.phone);
          }
        }
      }
    }
  }
};

/**
 * Auto-complete medicines whose endDate has passed
 */
const completeExpiredMedicines = async () => {
  const now = new Date();
  const updated = await Medicine.updateMany(
    { status: 'active', endDate: { $lt: startOfDay(now) } },
    { status: 'completed' }
  );

  if (updated.modifiedCount > 0) {
    console.log(`✅ ${updated.modifiedCount} medicine(s) marked as completed`);
  }
};

/**
 * Calculate adherence percentage for a patient over N days
 * @param {string} patientId
 * @param {number} days
 * @returns {{ rate: number, taken: number, total: number }}
 */
const calculateAdherenceRate = async (patientId, days = 7) => {
  const from = startOfDay(new Date());
  from.setDate(from.getDate() - (days - 1));

  const logs = await AdherenceLog.find({
    patientId,
    scheduledDate: { $gte: from, $lte: endOfDay(new Date()) },
  });

  const total = logs.length;
  const taken = logs.filter((l) => l.status === 'taken').length;
  const rate = total > 0 ? Math.round((taken / total) * 100) : 0;

  return { rate, taken, total, missed: total - taken };
};

module.exports = {
  fireReminders,
  detectMissedDoses,
  completeExpiredMedicines,
  calculateAdherenceRate,
};

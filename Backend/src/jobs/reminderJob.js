/**
 * Reminder Job — cron-based background scheduler
 *
 * Schedules:
 *   Every minute  → check & fire upcoming medicine reminders
 *   Every hour    → detect missed doses and alert caretakers
 *   Once daily    → auto-complete expired medicines
 *
 * Uses node-cron (lightweight, no external infrastructure needed).
 */

const cron = require('node-cron');
const {
  fireReminders,
  detectMissedDoses,
  completeExpiredMedicines,
} = require('../services/adherenceService');

const startReminderJobs = () => {
  console.log('⏱️  Starting MediSync background jobs...');

  // ─── Every minute: fire medicine reminders ──────────────────────────────────
  // Cron: "* * * * *" = run at the start of every minute
  cron.schedule('* * * * *', async () => {
    try {
      await fireReminders();
    } catch (err) {
      console.error('❌ Reminder job error:', err.message);
    }
  });

  // ─── Every 30 minutes: detect missed doses ───────────────────────────────────
  // Cron: "*/30 * * * *" = every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      await detectMissedDoses();
    } catch (err) {
      console.error('❌ Missed dose detection error:', err.message);
    }
  });

  // ─── Once daily at midnight: complete expired medicines ───────────────────────
  // Cron: "0 0 * * *" = 00:00 every day
  cron.schedule('0 0 * * *', async () => {
    try {
      await completeExpiredMedicines();
    } catch (err) {
      console.error('❌ Expired medicine cleanup error:', err.message);
    }
  });

  console.log('✅ Background jobs started: reminder (1 min), missed-dose (30 min), cleanup (daily)');
};

module.exports = { startReminderJobs };

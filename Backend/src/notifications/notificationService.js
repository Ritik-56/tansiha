/**
 * notificationService.js
 * Notification Service — creates in-app DB notifications and triggers push / SMS.
 *
 * All push calls pass the MongoDB user _id so that pushService can auto-clear
 * stale FCM tokens (registration-token-not-registered) from the database.
 */

const Notification = require('../models/Notification');
const { sendReminderPush, sendMissedDosePush } = require('./pushService');
const User = require('../models/User');

// ─── In-app notification (DB record) ─────────────────────────────────────────
/**
 * Save an in-app notification to the database.
 * These appear inside the MediSync app notification panel.
 */
const createNotification = async ({ userId, title, message, type = 'info', medicineId = null }) => {
  try {
    return await Notification.create({ userId, title, message, type, medicineId });
  } catch (err) {
    console.error('❌ [Notification] Could not save in-app notification:', err.message);
  }
};

// ─── Reminder notification (patient) ─────────────────────────────────────────
/**
 * Notify a patient of an upcoming medicine dose.
 * Creates an in-app record AND sends a push notification to their device.
 *
 * @param {Object} patientData - Mongoose User document (possibly stale from populate)
 * @param {Object} medicine    - Mongoose Medicine document
 * @param {string} scheduledTime - "HH:mm" string
 */
const notifyReminder = async (patientData, medicine, scheduledTime) => {
  console.log(`\n--- NOTIFICATION FLOW START (REMINDER) ---`);
  console.log(`🎯 Target Patient ID: ${patientData._id}`);

  // 1. Always fetch fresh user to ensure we have the absolute latest FCM token
  const user = await User.findById(patientData._id).select('fcmToken userId fullName role');
  if (!user) {
    console.error(`❌ [Notification] Patient not found in DB for ID: ${patientData._id}`);
    return;
  }

  console.log(`👤 Fetched Patient: ${user.fullName} (${user.userId}) | Role: ${user.role}`);
  console.log(`🔑 Retrieved FCM Token: ${user.fcmToken ? 'Exists (' + user.fcmToken.substring(0, 15) + '...)' : 'MISSING'}`);

  // In-app notification (always created)
  await createNotification({
    userId:     user._id,
    title:      '💊 Medicine Reminder',
    message:    `Time to take ${medicine.medicineName} (${medicine.dosage}) at ${scheduledTime}`,
    type:       'reminder',
    medicineId: medicine._id,
  });

  // Push notification (only if patient has a registered FCM token)
  if (user.fcmToken) {
    console.log(`🚀 Sending Push Notification to Patient ${user.userId}...`);
    await sendReminderPush(
      user.fcmToken,
      medicine.medicineName,
      medicine.dosage,
      scheduledTime,
      user._id  // ← passed for stale token auto-cleanup on failure
    );
    console.log(`✅ Push dispatch completed for Patient ${user.userId}`);
  } else {
    console.log(`ℹ️  [Notification] No FCM token for user ${user.userId || user._id} — push skipped.`);
  }
  console.log(`--- NOTIFICATION FLOW END ---\n`);
};

// ─── Missed dose notification (caretaker + patient) ───────────────────────────
/**
 * Notify a caretaker AND the patient about a missed dose.
 * Creates in-app records for both, then sends push to caretaker's device.
 *
 * @param {Object} caretakerData - Mongoose User document (caretaker, possibly stale)
 * @param {Object} patientData   - Mongoose User document (patient, possibly stale)
 * @param {Object} medicine      - Mongoose Medicine document
 */
const notifyMissedDose = async (caretakerData, patientData, medicine) => {
  console.log(`\n--- NOTIFICATION FLOW START (MISSED DOSE) ---`);
  console.log(`🎯 Target Caretaker ID: ${caretakerData._id} | Target Patient ID: ${patientData._id}`);

  // 1. Fetch fresh users
  const [caretaker, patient] = await Promise.all([
    User.findById(caretakerData._id).select('fcmToken userId fullName role'),
    User.findById(patientData._id).select('fcmToken userId fullName role')
  ]);

  if (!caretaker || !patient) {
    console.error(`❌ [Notification] Missing caretaker or patient in DB`);
    return;
  }

  console.log(`👤 Fetched Caretaker: ${caretaker.fullName} (${caretaker.userId}) | Role: ${caretaker.role}`);
  console.log(`🔑 Caretaker FCM Token: ${caretaker.fcmToken ? 'Exists (' + caretaker.fcmToken.substring(0, 15) + '...)' : 'MISSING'}`);
  console.log(`👤 Fetched Patient: ${patient.fullName} (${patient.userId}) | Role: ${patient.role}`);

  // In-app notification for caretaker
  await createNotification({
    userId:     caretaker._id,
    title:      '⚠️ Missed Dose Alert',
    message:    `${patient.fullName} missed their ${medicine.medicineName} dose`,
    type:       'missed',
    medicineId: medicine._id,
  });

  // In-app notification for patient
  await createNotification({
    userId:     patient._id,
    title:      '❌ You missed a dose',
    message:    `You missed your ${medicine.medicineName} dose. Please consult your doctor if this happens often.`,
    type:       'missed',
    medicineId: medicine._id,
  });

  // Push to caretaker (only if they have a token)
  if (caretaker.fcmToken) {
    console.log(`🚀 Sending Push Notification to Caretaker ${caretaker.userId}...`);
    await sendMissedDosePush(
      caretaker.fcmToken,
      patient.fullName,
      medicine.medicineName,
      caretaker._id  // ← passed for stale token auto-cleanup on failure
    );
    console.log(`✅ Push dispatch completed for Caretaker ${caretaker.userId}`);
  } else {
    console.log(`ℹ️  [Notification] No FCM token for caretaker ${caretaker.userId || caretaker._id} — push skipped.`);
  }
  console.log(`--- NOTIFICATION FLOW END ---\n`);
};

module.exports = { createNotification, notifyReminder, notifyMissedDose };

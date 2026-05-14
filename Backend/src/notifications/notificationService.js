/**
 * Notification Service — creates in-app notifications in the DB
 * and optionally sends push + SMS alongside.
 */

const Notification = require('../models/Notification');
const { sendReminderPush, sendMissedDosePush } = require('./pushService');

/**
 * Save an in-app notification to the database
 */
const createNotification = async ({ userId, title, message, type = 'info', medicineId = null }) => {
  try {
    return await Notification.create({ userId, title, message, type, medicineId });
  } catch (err) {
    console.error('❌ Could not save notification:', err.message);
  }
};

/**
 * Notify patient of an upcoming medicine reminder
 */
const notifyReminder = async (user, medicine, scheduledTime) => {
  // In-app notification
  await createNotification({
    userId: user._id,
    title: '💊 Medicine Reminder',
    message: `Time to take ${medicine.medicineName} (${medicine.dosage}) at ${scheduledTime}`,
    type: 'reminder',
    medicineId: medicine._id,
  });

  // Push notification
  if (user.fcmToken) {
    await sendReminderPush(user.fcmToken, medicine.medicineName, medicine.dosage, scheduledTime);
  }
};

/**
 * Notify caretaker of a missed dose by a patient
 */
const notifyMissedDose = async (caretaker, patient, medicine) => {
  // In-app for caretaker
  await createNotification({
    userId: caretaker._id,
    title: '⚠️ Missed Dose Alert',
    message: `${patient.fullName} missed their ${medicine.medicineName} dose`,
    type: 'missed',
    medicineId: medicine._id,
  });

  // In-app for patient too
  await createNotification({
    userId: patient._id,
    title: '❌ You missed a dose',
    message: `You missed your ${medicine.medicineName} dose. Please consult your doctor if this happens often.`,
    type: 'missed',
    medicineId: medicine._id,
  });

  // Push to caretaker
  if (caretaker.fcmToken) {
    await sendMissedDosePush(caretaker.fcmToken, patient.fullName, medicine.medicineName);
  }
};

module.exports = { createNotification, notifyReminder, notifyMissedDose };

/**
 * pushService.js
 * Push Notification Service — Modern Firebase Cloud Messaging (FCM) Architecture
 *
 * Uses firebase-admin SDK with serviceAccountKey.json credentials.
 * NO legacy FCM server key is used anywhere in this file.
 *
 * Features:
 *   - Singleton firebase-admin initialization (lazy, crash-safe)
 *   - Graceful simulated mode when serviceAccountKey.json is placeholder
 *   - Stale token auto-cleanup: invalid tokens are cleared from MongoDB on 404/410 errors
 *   - Multi-token broadcast helper for caretaker alerting
 *   - Structured logging for every dispatch
 */

const path = require('path');
const fs   = require('fs');

let adminObj = null; // Singleton firebase-admin instance

// ─── Lazy firebase-admin initialization ───────────────────────────────────────
const getAdmin = () => {
  if (adminObj) return adminObj;

  try {
    const admin = require('firebase-admin');

    // Already initialised by a previous call (e.g. hot-reload)
    if (admin.apps.length) {
      adminObj = admin;
      return adminObj;
    }

    const serviceAccountPath = path.resolve(__dirname, '../../serviceAccountKey.json');

    if (!fs.existsSync(serviceAccountPath)) {
      console.warn(
        '⚠️  [FCM] serviceAccountKey.json not found at:', serviceAccountPath,
        '\n   Download from: Firebase Console → Project Settings → Service accounts → Generate new private key'
      );
      // Fallback to Application Default Credentials (works in GCP/Cloud Run environments)
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      adminObj = admin;
      return adminObj;
    }

    const serviceAccount = require(serviceAccountPath);

    // Detect placeholder file (newly cloned repo, no real key yet)
    const isPlaceholder =
      !serviceAccount.private_key ||
      serviceAccount.private_key.includes('placeholder') ||
      serviceAccount.private_key_id === 'placeholder_private_key_id';

    if (isPlaceholder) {
      console.warn(
        '⚠️  [FCM] serviceAccountKey.json contains placeholder values.',
        '\n   Push notifications will run in SIMULATED mode (logged only, not delivered).',
        '\n   To enable real push: replace serviceAccountKey.json with your downloaded service account.'
      );
      // Simulated engine — all sends are logged but not dispatched to FCM
      adminObj = {
        messaging: () => ({
          send: async (msg) => {
            console.log('🔔 [FCM Simulated] Would dispatch:', JSON.stringify(msg, null, 2));
            return `projects/${serviceAccount.project_id || 'medisync'}/messages/simulated-${Date.now()}`;
          },
        }),
      };
      return adminObj;
    }

    // Real credentials — initialize properly
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('✅ [FCM] firebase-admin initialized for project:', serviceAccount.project_id);
    adminObj = admin;
    return adminObj;

  } catch (err) {
    console.error('❌ [FCM] firebase-admin initialization failed:', err.message);
    // Zero-crash fallback
    adminObj = {
      messaging: () => ({
        send: async (msg) => {
          console.log('🔔 [FCM Fallback] Push payload captured (not delivered):', JSON.stringify(msg));
          return 'fallback-message-id';
        },
      }),
    };
    return adminObj;
  }
};

// ─── Stale token cleanup ───────────────────────────────────────────────────────
/**
 * When FCM returns registration-token-not-registered or invalid-registration-token,
 * the token is dead and must be removed from the DB to avoid repeated failures.
 */
const clearStaleToken = async (userId) => {
  if (!userId) return;
  try {
    const User = require('../models/User');
    await User.findByIdAndUpdate(userId, { fcmToken: null });
    console.log(`🗑️  [FCM] Stale token cleared for user: ${userId}`);
  } catch (err) {
    console.warn('⚠️  [FCM] Could not clear stale token:', err.message);
  }
};

const STALE_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

// ─── Core send function ────────────────────────────────────────────────────────
/**
 * Send a push notification to a single FCM device token.
 *
 * @param {string}  fcmToken - device registration token
 * @param {string}  title
 * @param {string}  body
 * @param {Object}  data     - additional key/value payload (all values must be strings)
 * @param {string}  [userId] - MongoDB user _id, used for stale token cleanup
 */
const sendPushNotification = async (fcmToken, title, body, data = {}, userId = null) => {
  if (!fcmToken) {
    console.warn('⚠️  [FCM] sendPushNotification called with no token — skipping.');
    return null;
  }

  const firebaseAdmin = getAdmin();
  if (!firebaseAdmin) return null;

  // FCM data payloads require all values to be strings
  const stringifiedData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  const message = {
    token: fcmToken,
    notification: { title, body },
    data: stringifiedData,
    // Android — high priority to wake device from Doze mode
    android: {
      priority: 'high',
      notification: {
        sound:     'default',
        channelId: 'medisync-reminders',
        icon:      'ic_notification',
        tag:       `medisync-${stringifiedData.type || 'reminder'}-${stringifiedData.medicineName || 'med'}`.replace(/\s+/g, '-').toLowerCase(),
      },
    },
    // iOS (APNs)
    apns: {
      payload: {
        aps: {
          sound:              'default',
          badge:              1,
          'content-available': 1,
        },
      },
    },
    // Web Push — for browser (Chrome, Edge, Firefox)
    webpush: {
      headers: { Urgency: 'high' },
      // Top-level data: this is what gets forwarded to the SW as payload.data
      // The SW notificationclick handler reads event.notification.data
      // which is populated from notification.data (set below), NOT webpush.data.
      // BOTH must be present for full compatibility.
      data: stringifiedData,
      notification: {
        title,
        body,
        requireInteraction: true,
        // Data attached to the notification object itself — readable in
        // the SW via event.notification.data after a notification click.
        data: {
          url:          stringifiedData.url          || '/dashboard',
          type:         stringifiedData.type         || 'reminder',
          medicineName: stringifiedData.medicineName || '',
          dosage:       stringifiedData.dosage       || '',
          time:         stringifiedData.time         || '',
          ...stringifiedData,
        },
      },
      fcmOptions: {
        link: stringifiedData.url || '/dashboard',
      },
    },
  };

  try {
    const response = await firebaseAdmin.messaging().send(message);
    console.log(`✅ [FCM] Push delivered. Message ID: ${response}`);
    return response;
  } catch (err) {
    const code = err.code || err.errorInfo?.code || '';
    console.error(`❌ [FCM] Push delivery failed [${code}]:`, err.message);

    // Auto-clear stale / invalid tokens so they don't clog the DB
    if (STALE_TOKEN_ERRORS.has(code)) {
      await clearStaleToken(userId);
    }

    return null;
  }
};

// ─── Reminder notification ─────────────────────────────────────────────────────
/**
 * Send a medicine reminder push to a patient.
 * @param {string} fcmToken
 * @param {string} medicineName
 * @param {string} dosage
 * @param {string} time         - scheduled time string e.g. "08:30"
 * @param {string} [userId]     - MongoDB user _id for stale token cleanup
 */
const sendReminderPush = async (fcmToken, medicineName, dosage, time, userId = null) => {
  return sendPushNotification(
    fcmToken,
    '💊 Medicine Reminder',
    `Time to take ${medicineName} (${dosage}) at ${time}`,
    { type: 'reminder', medicineName, dosage, time, url: '/dashboard' },
    userId
  );
};

// ─── Missed dose alert (caretaker) ────────────────────────────────────────────
/**
 * Send a missed-dose alert push to a caretaker.
 * @param {string} fcmToken
 * @param {string} patientName
 * @param {string} medicineName
 * @param {string} [userId]
 */
const sendMissedDosePush = async (fcmToken, patientName, medicineName, userId = null) => {
  return sendPushNotification(
    fcmToken,
    '⚠️ Missed Dose Alert',
    `${patientName} missed their ${medicineName} dose`,
    { type: 'missed', patientName, medicineName, url: '/caretaker' },
    userId
  );
};

// ─── Multi-token broadcast ────────────────────────────────────────────────────
/**
 * Send the same notification to multiple FCM tokens (e.g. all caretakers of a patient).
 * Results for each token are returned independently — one failure doesn't block others.
 *
 * @param {Array<{fcmToken: string, userId: string}>} recipients
 * @param {string} title
 * @param {string} body
 * @param {Object} data
 */
const sendBroadcastPush = async (recipients, title, body, data = {}) => {
  if (!recipients || recipients.length === 0) return [];

  const results = await Promise.allSettled(
    recipients.map(({ fcmToken, userId }) =>
      sendPushNotification(fcmToken, title, body, data, userId)
    )
  );

  const succeeded = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  console.log(`📡 [FCM] Broadcast: ${succeeded}/${recipients.length} delivered.`);
  return results;
};

module.exports = {
  sendPushNotification,
  sendReminderPush,
  sendMissedDosePush,
  sendBroadcastPush,
};

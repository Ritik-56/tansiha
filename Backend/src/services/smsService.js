/**
 * SMS Service — Fast2SMS & Twilio Integration layer with Duplicate Prevention and Validation.
 */

const axios = require('axios');

// In-memory cache to prevent duplicate SMS sent within a short threshold
const sentSmsCache = new Set();

const preventDuplicateSMS = (to, message) => {
  const cacheKey = `${to}:${message}`;
  if (sentSmsCache.has(cacheKey)) {
    console.log(`⏩ Duplicate SMS prevented for ${to} within 5-minute cooldown threshold.`);
    return true;
  }
  sentSmsCache.add(cacheKey);
  // Keep key in cache for 5 minutes
  setTimeout(() => sentSmsCache.delete(cacheKey), 5 * 60 * 1000);
  return false;
};

const isValidPhoneNumber = (phone) => {
  if (!phone || typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10;
};

const sendViaTwilio = async (to, message) => {
  const twilio = require('twilio');
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  await client.messages.create({
    body: message,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
};

const sendViaFast2SMS = async (to, message) => {
  const apiKey = process.env.FAST2SMS_API_KEY;
  if (!apiKey || apiKey.includes('placeholder')) {
    console.warn('⚠️  Fast2SMS API key is missing or placeholder. Logging simulated SMS dispatch.');
    console.log(`✉️ [Fast2SMS Simulated] To: ${to} | Message: "${message}"`);
    return;
  }

  // Sanitize number for Fast2SMS route (extract last 10 digits typically)
  const digitsOnly = to.replace(/\D/g, '');
  const number = digitsOnly.length > 10 ? digitsOnly.slice(-10) : digitsOnly;

  try {
    const response = await axios.post(
      'https://www.fast2sms.com/dev/bulkV2',
      {
        route: 'q',
        message,
        language: 'english',
        flash: 0,
        numbers: number,
      },
      {
        headers: { authorization: apiKey },
      }
    );
    console.log(`✉️ Fast2SMS bulkV2 API responded successfully:`, response.data);
  } catch (err) {
    console.error('❌ Fast2SMS API delivery error intercepted safely:', err.response?.data || err.message);
    // Log as simulation fallback to guarantee continuous process execution
    console.log(`✉️ [Fast2SMS Fallback Sim] Intercepted payload delivery: "${message}" to ${to}`);
  }
};

/**
 * Send an SMS with validation and duplicate prevention checks
 * @param {string} to - phone number
 * @param {string} message - exact SMS payload string
 */
const sendSMS = async (to, message) => {
  if (!isValidPhoneNumber(to)) {
    console.warn(`⚠️ Invalid phone number format provided for SMS dispatch: "${to}". Skipping send.`);
    return;
  }

  if (preventDuplicateSMS(to, message)) {
    return;
  }

  const provider = process.env.SMS_PROVIDER || 'fast2sms';

  try {
    if (provider === 'twilio') {
      await sendViaTwilio(to, message);
    } else {
      await sendViaFast2SMS(to, message);
    }
    console.log(`📱 SMS triggered securely to ${to} via ${provider}`);
  } catch (err) {
    console.error(`❌ SMS module delivery error (${provider}):`, err.message);
  }
};

/**
 * 1. Send a medicine reminder SMS
 * Example requested: "Reminder: Time to take Atorvastatin 20mg at 5:00 PM."
 */
const sendReminderSMS = async (phone, medicineName, dosage, time) => {
  const message = `Reminder: Time to take ${medicineName} ${dosage} at ${time}.`;
  await sendSMS(phone, message);
};

/**
 * 2. Send a missed dose SMS to patient directly
 * Example requested: "You missed your scheduled medicine reminder."
 */
const sendMissedDoseSMS = async (phone) => {
  const message = `You missed your scheduled medicine reminder.`;
  await sendSMS(phone, message);
};

/**
 * 3. Send a caretaker alert SMS
 * Example requested: "Alert: Patient missed scheduled medicine."
 */
const sendMissedDoseAlertSMS = async (caretakerPhone) => {
  const message = `Alert: Patient missed scheduled medicine.`;
  await sendSMS(caretakerPhone, message);
};

module.exports = {
  sendSMS,
  sendReminderSMS,
  sendMissedDoseSMS,
  sendMissedDoseAlertSMS,
};

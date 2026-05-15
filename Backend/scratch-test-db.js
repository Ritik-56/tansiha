require('dotenv').config();
const mongoose = require('mongoose');
const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
const User = require('./src/models/User');

admin.initializeApp({ credential: admin.credential.cert(sa) });

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const user = await User.findOne({ fcmToken: { $ne: null } });
  if (!user) {
    console.log('❌ No user found with FCM token');
    process.exit(1);
  }

  console.log(`Sending to token: ${user.fcmToken}`);

  const message = {
    token: user.fcmToken,
    notification: {
      title: 'Direct Test',
      body: 'This is a test directly from backend'
    }
  };

  try {
    const res = await admin.messaging().send(message);
    console.log('✅ Sent successfully:', res);
  } catch (e) {
    console.error('❌ Failed:', e.message);
  }

  process.exit(0);
}

test();

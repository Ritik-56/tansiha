const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(sa) });

const token = process.argv[2];
if (!token) {
  console.error("Please provide a token");
  process.exit(1);
}

// Data-only payload (most reliable for custom SW)
const message1 = {
  token: token,
  data: {
    title: 'Data-only push',
    body: 'This is a data only push',
    type: 'test'
  }
};

// Notification payload (relies on Firebase SDK default rendering)
const message2 = {
  token: token,
  notification: {
    title: 'Notification push',
    body: 'This is a notification push'
  },
  data: {
    type: 'test'
  }
};

async function test() {
  try {
    const res2 = await admin.messaging().send(message2);
    console.log('✅ Notification push sent:', res2);
  } catch (e) {
    console.error('❌ Notification push failed:', e.message);
  }
}

test();

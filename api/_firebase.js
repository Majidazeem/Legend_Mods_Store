// api/_firebase.js
// Ye file sirf server pe run hoti hai — browser mein kabhi nahi aati
// Firebase credentials sirf yahan hain — inspect se nahi milte

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:     process.env.FB_PROJECT_ID,
      clientEmail:   process.env.FB_CLIENT_EMAIL,
      privateKey:    process.env.FB_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FB_DATABASE_URL,
  });
}

const db = admin.database();
module.exports = { db };

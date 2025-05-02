// netlify/functions/firebaseAdmin.ts
import * as admin from 'firebase-admin';

// --- Firebase Admin Initialization ---
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
  throw new Error('Missing required Firebase environment variables (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY)');
}

// Fix: Ensure correct newlines in private key for Netlify
const processedPrivateKey = firebasePrivateKey?.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: firebaseProjectId,
      clientEmail: firebaseClientEmail,
      privateKey: processedPrivateKey,
    }),
  });
}

export const auth = admin.auth();
export default admin;

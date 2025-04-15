// netlify/functions/verify-access-code.ts
import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import * as admin from 'firebase-admin';

// --- Firebase Admin SDK Initialization (Attempt only once) ---
let adminApp: admin.app.App | null = null;
let initializationError: Error | null = null;

if (!admin.apps.length) {
  try {
    // Get credentials from environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    // Try reading private key directly, assuming env var handles newlines
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase Admin SDK credentials missing or incomplete in environment variables.');
    }

    adminApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: projectId,
        clientEmail: clientEmail,
        privateKey: privateKey, // Use directly
      }),
    });
    console.log('[verify-access-code] Firebase Admin SDK initialized successfully.');
  } catch (error: any) {
    console.error('[verify-access-code] FATAL: Error initializing Firebase Admin SDK:', error);
    initializationError = error; // Store error to return in handler
  }
}

// --- End Firebase Admin SDK Initialization ---

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('[verify-access-code] Handler invoked.');
  console.log(`[verify-access-code] HTTP Method: ${event.httpMethod}`);
  console.log(`[verify-access-code] Raw event body: ${event.body}`); // Log raw body

  // Check if initialization failed
  if (initializationError) {
    console.log('[verify-access-code] Returning 500 due to initialization error.');
    return {
      statusCode: 500,
      body: JSON.stringify({ verified: false, error: `Firebase Admin SDK initialization failed: ${initializationError.message}` })
    };
  }
  // Double-check if app is initialized (should be unless error occurred)
  if (!admin.apps.length || !adminApp) {
    console.log('[verify-access-code] Returning 500 due to SDK not initialized.');
     return {
      statusCode: 500,
      body: JSON.stringify({ verified: false, error: 'Firebase Admin SDK not initialized.' })
    };
  }

  const db = adminApp.firestore(); // Use firestore from the initialized app

  if (event.httpMethod !== "POST") {
    console.log('[verify-access-code] Returning 405 Method Not Allowed.');
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  let email: string | undefined;
  let accessCode: string | undefined;

  try {
    const body = JSON.parse(event.body || '{}');
    console.log('[verify-access-code] Parsed body:', body);
    email = body.email;
    accessCode = body.accessCode;

    if (!email || !accessCode) {
       console.log('[verify-access-code] Returning 400 Bad Request (Missing email or code).');
      return { statusCode: 400, body: JSON.stringify({ verified: false, error: 'Email and access code are required.' }) };
    }

    console.log(`[verify-access-code] Verification attempt for email: ${email}, code: ${accessCode}`);

    // --- Firestore Verification Logic ---
    const accessCodesRef = db.collection('accessCodes');
    const querySnapshot = await accessCodesRef.where('code', '==', accessCode).limit(1).get();

    if (querySnapshot.empty) {
      console.log(`[verify-access-code] Access code ${accessCode} not found in Firestore.`);
       console.log('[verify-access-code] Returning 400 Bad Request (Invalid code).');
      return {
        statusCode: 400, // Use 400 for client error (bad code)
        body: JSON.stringify({ verified: false, error: 'Invalid access code.' })
      };
    }

    const doc = querySnapshot.docs[0];
    const codeData = doc.data();

    // Check for existence of fields before accessing
    if (codeData?.isValid === false) { // Explicitly check for false
      console.log(`[verify-access-code] Access code ${accessCode} is not valid.`);
       console.log('[verify-access-code] Returning 400 Bad Request (Code not valid).');
      return {
        statusCode: 400,
        body: JSON.stringify({ verified: false, error: 'Access code is no longer valid.' })
      };
    }

    if (codeData?.isUsed === true) { // Explicitly check for true
      // Allow re-verification *only if* the same email is trying again
      if (codeData.usedByEmail !== email) {
          console.log(`[verify-access-code] Access code ${accessCode} has already been used by a different email (${codeData.usedByEmail || 'unknown'}).`);
          console.log('[verify-access-code] Returning 400 Bad Request (Code already used by another).');
          return {
            statusCode: 400,
            body: JSON.stringify({ verified: false, error: 'Access code has already been used.' })
          };
      } else {
          console.log(`[verify-access-code] Access code ${accessCode} was already used by this email (${email}). Allowing re-verification step.`);
          // If already used by the *same* email, verification still passes,
          // allowing them to trigger the magic link again without needing a new code.
          // We don't update Firestore again.
          console.log('[verify-access-code] Returning 200 OK (Code previously used by same email).');
           return {
            statusCode: 200,
            body: JSON.stringify({ verified: true, message: 'Access code verified successfully.' })
          };
      }
    }

    // Code is valid and unused - Mark as used
    try {
      await doc.ref.update({
        isUsed: true,
        usedByEmail: email,
        usedTimestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[verify-access-code] Access code ${accessCode} successfully verified and marked as used by ${email}.`);
       console.log('[verify-access-code] Returning 200 OK.');
      return {
        statusCode: 200,
        body: JSON.stringify({ verified: true, message: 'Access code verified successfully.' })
      };
    } catch (updateError) {
      console.error(`[verify-access-code] Error updating access code ${accessCode} in Firestore:`, updateError);
       console.log('[verify-access-code] Returning 500 Internal Server Error (Firestore update failed).');
      return {
        statusCode: 500,
        body: JSON.stringify({ verified: false, error: 'Failed to update access code status.' })
      };
    }
    // --- End Firestore Verification Logic ---
    

  } catch (error: any) {
    console.error('[verify-access-code] Error in handler catch block:', error);
    // Distinguish parsing errors from others
    if (error instanceof SyntaxError && error.message.includes('JSON.parse')) {
       console.log('[verify-access-code] Returning 400 Bad Request (JSON parse failed).');
        return { statusCode: 400, body: JSON.stringify({ verified: false, error: 'Invalid request body format.' }) };
    }
    // General internal error
     console.log('[verify-access-code] Returning 500 Internal Server Error (General catch block).');
    return {
        statusCode: 500,
        body: JSON.stringify({ verified: false, error: 'An internal server error occurred processing your request.' })
    };
  }
};

export { handler };

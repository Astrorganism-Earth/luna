import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import Stripe from 'stripe';
import * as admin from 'firebase-admin';
import { findOrCreateStripeCustomer } from './utils/stripeUtils';

// --- Firebase Initialization Function ---
let firebaseInitialized = false;
const initializeFirebaseAdmin = async (): Promise<boolean> => {
    if (firebaseInitialized) {
        console.log('Firebase Admin SDK already initialized.');
        return true;
    }
    try {
        console.log('Attempting Firebase Admin SDK initialization using individual key components...');

        // Check for required environment variables
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;

        if (!projectId || !clientEmail || !privateKey) {
            const missingKeys = [
                !projectId ? 'FIREBASE_PROJECT_ID' : null,
                !clientEmail ? 'FIREBASE_CLIENT_EMAIL' : null,
                !privateKey ? 'FIREBASE_PRIVATE_KEY' : null,
            ].filter(Boolean).join(', ');
            console.error(`Missing required Firebase environment variable(s): ${missingKeys}`);
            throw new Error(`Missing required Firebase environment variable(s): ${missingKeys}`);
        }

        // Replace escaped newlines in the private key
        const formattedPrivateKey = privateKey.replace(/\n/g, '\n');

        console.log(`Using Firebase Project ID: ${projectId}`);
        console.log(`Using Firebase Client Email: ${clientEmail}`);
        // Avoid logging the private key itself

        if (admin.apps.length === 0) {
             console.log('No existing Firebase apps found. Initializing new app...');
             admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: projectId,
                    clientEmail: clientEmail,
                    privateKey: formattedPrivateKey,
                }),
             });
            console.log('Firebase Admin SDK initialized successfully using individual components.');
            firebaseInitialized = true;
            return true;
        } else {
            console.log(`Firebase Admin SDK already initialized (${admin.apps.length} apps exist). Skipping init.`);
            firebaseInitialized = true; // Mark as initialized even if skipped
            return true;
        }
    } catch (error: any) {
        console.error('CRITICAL: Firebase Admin SDK initialization FAILED:', error);
        // Log specific details if possible
        if (error.message.includes('Missing required Firebase environment variable')) {
             console.error('Initialization Error Detail: Check Netlify environment variable configuration.');
        } else if (error.code === 'app/invalid-credential' || error.message.includes('private key')) {
            console.error('Initialization Error Detail: Issue with Firebase credentials (project ID, email, or private key format/value). Verify environment variables.');
        }
        firebaseInitialized = false;
        return false;
    }
};

// --- Stripe Initialization ---
let stripe: Stripe | null = null;
try {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set.');
  }
  stripe = new Stripe(secretKey, {
    apiVersion: '2025-03-31.basil', // Matched API version
    typescript: true,
  });
  console.log('Stripe SDK initialized successfully.');
} catch (error: any) {
  console.error('Stripe SDK initialization error:', error);
}

// --- Handler ---
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  console.log('--- create-customer-portal-session handler started ---');

  // 1. Ensure Firebase is initialized *before* proceeding
  const firebaseReady = await initializeFirebaseAdmin();
  if (!firebaseReady) {
      console.error('Handler aborting: Firebase Admin SDK failed to initialize.');
      return { statusCode: 500, body: JSON.stringify({ error: 'Internal server configuration error (Firebase).' }) };
  }
  console.log('Firebase check passed.');

  // 2. Check HTTP Method
  if (event.httpMethod !== 'POST') {
    console.warn(`Method Not Allowed: ${event.httpMethod}`);
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  console.log('HTTP Method check passed.');

  // 3. Check Stripe Initialization
  if (!stripe) {
    console.error('Handler aborting: Stripe SDK not initialized.');
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server configuration error (Stripe).' }) };
  }
  console.log('Stripe check passed.');

  // 4. Get Firebase token from Authorization header
  const authorizationHeader = event.headers.authorization;
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.warn('Unauthorized: Missing or invalid token header.');
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Missing or invalid token' }) };
  }
  const firebaseToken = authorizationHeader.split('Bearer ')[1];
  console.log('Token header found.');

  try {
    // 5. Verify Firebase token and get UID
    console.log('Verifying Firebase ID token...');
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken); // This is where the error likely occurred
    const uid = decodedToken.uid;
    const email = decodedToken.email;
    console.log(`Token verified successfully. UID: ${uid}, Email: ${email}`);

    if (!uid || !email) {
      console.error('Token verification succeeded but UID or Email is missing.');
      throw new Error('Could not extract UID or Email from token.');
    }

    // 6. Find the Stripe Customer ID
    console.log(`Finding/creating Stripe customer for UID: ${uid}...`);
    const { customerId, error: customerError } = await findOrCreateStripeCustomer(uid, email, stripe);

    if (customerError || !customerId) {
        console.error(`Error finding/creating Stripe customer for UID ${uid}:`, customerError);
        return { statusCode: 500, body: JSON.stringify({ error: customerError || 'Failed to retrieve customer information.' }) };
    }
    console.log(`Using Stripe Customer ID: ${customerId}`);

    // 7. Determine the return URL
    const returnUrlBase = process.env.NETLIFY_DEV === 'true'
      ? `http://localhost:8888/subscription`
      : process.env.URL + '/subscription';
    const returnUrl = returnUrlBase;
    console.log(`Creating portal session for customer ${customerId}. Return URL: ${returnUrl}`);

    // 8. Create the Stripe Billing Portal Session (implicitly using default config)
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      // No 'configuration' parameter here, rely on Stripe default
    });
    console.log(`Portal session created successfully: ${portalSession.id}`);

    // 9. Return the session URL
    console.log('--- create-customer-portal-session handler finished successfully ---');
    return {
      statusCode: 200,
      body: JSON.stringify({ portalUrl: portalSession.url }),
    };

  } catch (error: any) {
    console.error('Error during handler execution:', error);
    let statusCode = 500;
    let message = 'Failed to create customer portal session.';

    // Add specific error handling if needed (e.g., for token verification errors)
    if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        statusCode = 401;
        message = 'Authentication error. Please log in again.';
        console.warn(`Authentication error encountered: ${error.code}`);
    } else if (error.type === 'StripeCardError' || error.type === 'StripeInvalidRequestError') {
        console.error(`Stripe Error Details: Code=${error.code}, Param=${error.param}, Message=${error.message}`);
        if (error.message.includes('No configuration provided')) {
            message = 'Failed to create customer portal session. Stripe configuration missing or not found.';
            const errorDetails = 'Please ensure a default customer portal configuration is saved in your Stripe Dashboard (Test Mode) under Settings > Billing > Customer Portal.';
            console.error(`Error Details: ${errorDetails}`);
        }
    }

    console.log(`--- create-customer-portal-session handler finished with error (${statusCode}) ---`);
    return {
      statusCode: statusCode,
      body: JSON.stringify({ error: message, details: error.message }), // Include original message for debugging
    };
  }
};

export { handler };

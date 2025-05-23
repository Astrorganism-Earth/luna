// netlify/functions/create-checkout-session.ts
import { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { findOrCreateStripeCustomer } from './utils/stripeUtils'; // Import the utility function

// --- Firebase Admin Initialization --- 
// Ensure your Firebase service account key JSON is correctly set as a Netlify environment variable
// Note: For local dev with `netlify dev`, put it in your .env file.

// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (!admin.apps.length) {
  const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!firebasePrivateKey) {
    console.error('Firebase private key is not defined in environment variables.');
    // Potentially throw an error or handle appropriately
    // For now, we'll log and proceed, but Stripe calls might fail if Firebase is needed before this
    // throw new Error('Firebase private key is not defined.');
  }
  
  // Only initialize if all required Firebase env vars are present
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && firebasePrivateKey) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: firebasePrivateKey, 
        }),
        // databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com` // Optional: If you use Realtime Database
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      console.error('Firebase Admin SDK initialization error:', error);
      // Depending on your error handling strategy, you might want to re-throw the error
      // or ensure the function cannot proceed without Firebase if it's critical.
      throw new Error('Failed to initialize Firebase Admin SDK.');
    }
  } else {
    console.warn('One or more Firebase Admin SDK environment variables are missing. SDK not initialized.');
    // throw new Error('Missing Firebase Admin SDK environment variables.'); // Or handle as a non-fatal issue if applicable
  }
}

// Initialize Stripe with the secret key from environment variables
// Ensure STRIPE_SECRET_KEY is set in your Netlify environment variables
const stripeSecretKey = process.env.STRIPE_SECRET_KEY; // Use the correct backend-only variable name

if (!stripeSecretKey) {
  // Log the error clearly for debugging
  throw new Error('STRIPE_SECRET_KEY environment variable not set.');
}
let stripe: Stripe;
try {
  stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2025-03-31.basil', // Update API version to match type
    typescript: true,
  });
  console.log('Stripe SDK initialized successfully.');
} catch (error) {
  console.error('Stripe initialization error:', error);
  throw new Error('Failed to initialize Stripe SDK.');
}

// Define the structure of the incoming request body
interface RequestBody {
  planIdentifier: 'monthly' | 'annual';
  // Add customerId or userEmail later if needed for linking subscriptions
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: { 
        'Access-Control-Allow-Origin': process.env.URL || '*', 
        'Access-Control-Allow-Methods': 'POST, OPTIONS', 
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '', // Empty body for OPTIONS
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 
        'Allow': 'POST',
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // Ensure the request body exists
    if (!event.body) {
      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing request body' }) 
      };
    }

    // Parse the request body
    const { planIdentifier } = JSON.parse(event.body) as RequestBody;

    // **Log received planIdentifier**
    console.log('Received planIdentifier:', planIdentifier);

    // 1. Verify Firebase Token from Header
    const firebaseTokenFromHeader = event.headers?.authorization?.split('Bearer ')[1];

    if (!firebaseTokenFromHeader) {
      console.error("Checkout Error: Authorization header missing or malformed.");
      return {
        headers: { 'Content-Type': 'application/json' },
        statusCode: 401, // Unauthorized
        body: JSON.stringify({ error: 'Authorization token is required.' }),
      };
    }

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(firebaseTokenFromHeader);
    } catch (error: any) {
      console.error('Firebase token verification failed:', error);
      return {
        headers: { 'Content-Type': 'application/json' },
        statusCode: 401, // Unauthorized
        body: JSON.stringify({ error: 'Invalid or expired Firebase token.', details: error.message }),
      };
    }
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email;

    if (!userId || !userEmail) {
      console.error('Checkout Error: User ID or email missing in Firebase token.');
      return {
        headers: { 'Content-Type': 'application/json' }, 
        statusCode: 400,
        body: JSON.stringify({ error: 'User ID or email missing in Firebase token.' })
      };
    }

    // 2. Determine Price ID based on planIdentifier
    // Ensure STRIPE_MONTHLY_PRICE_ID & STRIPE_ANNUAL_PRICE_ID are set in Netlify env vars
    const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;
    const annualPriceId = process.env.STRIPE_ANNUAL_PRICE_ID;

    // **Log environment variables being read**
    console.log('ENV VAR CHECK - STRIPE_MONTHLY_PRICE_ID:', monthlyPriceId);
    console.log('ENV VAR CHECK - STRIPE_ANNUAL_PRICE_ID:', annualPriceId);

    if (!monthlyPriceId || !annualPriceId) {
      console.error('Stripe Price IDs are not set in environment variables.');
      return { 
        headers: { 'Content-Type': 'application/json' }, 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Server configuration error: Missing Stripe Price IDs.' }) 
      };
    }

    let priceId: string;
    if (planIdentifier === 'monthly') {
      priceId = monthlyPriceId;
    } else if (planIdentifier === 'annual') {
      priceId = annualPriceId;
    } else {
      console.error(`Checkout Error: Invalid plan identifier: ${planIdentifier}`);
      return {
        headers: { 'Content-Type': 'application/json' }, 
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid subscription plan specified.' })
      };
    }

    // **Log the selected Price ID**
    console.log(`Selected Price ID for plan '${planIdentifier}':`, priceId);

    // 3. Find or Create Stripe Customer
    let stripeCustomerId: string;
    try {
      const { customerId, error: customerError } = await findOrCreateStripeCustomer(userId, userEmail, stripe);
      if (customerError || !customerId) {
        console.error('Error finding/creating Stripe customer:', customerError);
        return {
          headers: { 'Content-Type': 'application/json' },
          statusCode: 500,
          body: JSON.stringify({ error: customerError || 'Failed to process customer information.' }),
        };
      }
      stripeCustomerId = customerId;
      console.log(`findOrCreateStripeCustomer: Using Stripe Customer ID: ${stripeCustomerId} for Firebase UID: ${userId}`);
    } catch (error) {
      console.error('Error finding or creating Stripe customer:', error);
      return {
        headers: { 'Content-Type': 'application/json' },
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to find or create Stripe customer.' }),
      };
    }

    console.log(`findOrCreateStripeCustomer: Using Stripe Customer ID: ${stripeCustomerId} for Firebase UID: ${userId}`);

    // Define success and cancel URLs
    const successUrl = `${process.env.URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${process.env.URL}/subscribe`;

    // --- Create Stripe Checkout Session --- 
    const sessionCreateParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer: stripeCustomerId, // Link the session to the Stripe Customer
      metadata: {
        firebaseUid: userId, // Pass the Firebase UID from decoded token
      },
      // Automatically collect tax if configured in Stripe Tax settings
      // automatic_tax: { enabled: true }, // Temporarily commented out for testing
      // Allow promotion codes if you have them set up in Stripe
      // allow_promotion_codes: true,
    };

    // Log the parameters being sent to Stripe
    console.log('Stripe Session Create Params:', JSON.stringify(sessionCreateParams, null, 2));

    const session = await stripe.checkout.sessions.create(sessionCreateParams);

    console.log('Stripe Checkout Session created:', session.id);

    // 5. Return the Session URL in a JSON object
    if (!session.url) {
      console.error('Stripe Checkout Session created but missing URL:', session.id);
      return {
        headers: { 'Content-Type': 'application/json' },
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to get checkout URL from Stripe.' }),
      };
    }

    return {
      headers: { 'Content-Type': 'application/json' },
      statusCode: 200,
      body: JSON.stringify({ checkoutUrl: session.url }), // Return the actual URL
    };

  } catch (error: any) {
    console.error('Error in create-checkout-session function:', error);
    // Return a JSON error object instead of throwing
    return {
      headers: { 'Content-Type': 'application/json' },
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'Internal Server Error creating checkout session.' }),
    };
  }
};

export { handler };

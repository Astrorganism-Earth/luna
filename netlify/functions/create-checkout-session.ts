// netlify/functions/create-checkout-session.ts
import { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import Stripe from 'stripe';
import admin from 'firebase-admin';

// --- Firebase Admin Initialization --- 
// Ensure your Firebase service account key JSON is correctly set as a Netlify environment variable
// Note: For local dev with `netlify dev`, put it in your .env file.

// Load Firebase config from individual environment variables
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Replace literal '\n' in the private key from env var with actual newlines
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n');

if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
  throw new Error('Missing required Firebase environment variables (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY)');
}

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: firebaseProjectId,
        clientEmail: firebaseClientEmail,
        privateKey: firebasePrivateKey,
      }),
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error("Firebase Admin initialization error:", error);
    // Stop further execution if Firebase fails to init
    throw new Error('Failed to initialize Firebase Admin SDK.'); 
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
  firebaseToken: string;
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
    const { planIdentifier, firebaseToken } = JSON.parse(event.body) as RequestBody;

    // **Log received planIdentifier**
    console.log('Received planIdentifier:', planIdentifier);

    // 1. Verify Firebase Token
    let decodedToken;
    if (!firebaseToken) {
      console.error("Checkout Error: Firebase token missing.");
      return {
        headers: { 'Content-Type': 'application/json' }, 
        statusCode: 400,
        body: JSON.stringify({ error: 'Firebase token is required.' }),
      };
    }

    try {
      decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    } catch (error) {
      console.error("Checkout Error: Firebase token verification failed:", error);
      return {
        headers: { 'Content-Type': 'application/json' }, 
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid Firebase token.' })
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

    // Function to find or create a Stripe customer associated with Firebase UID
    const findOrCreateStripeCustomer = async (firebaseUid: string, email?: string): Promise<Stripe.Customer> => {
      console.log(`DEBUG: findOrCreateStripeCustomer: Searching for UID=${firebaseUid}, Email=${email}`); // Log inputs

      const listParams: Stripe.CustomerListParams = { limit: 100 };
      if (email) {
        listParams.email = email;
      }
      console.log('DEBUG: Calling stripe.customers.list with params:', JSON.stringify(listParams, null, 2)); // Log params before call

      let customers: Stripe.Response<Stripe.ApiList<Stripe.Customer>>;
      try {
        // Check if customer exists by Firebase UID metadata
        customers = await stripe.customers.list(listParams); // Use explicitly built params
        console.log(`DEBUG: stripe.customers.list returned ${customers.data.length} customers.`); // Log result count
      } catch (listError) {
        console.error('DEBUG: Error during stripe.customers.list:', listError);
        throw listError; // Re-throw the error if listing fails
      }

      let customer = customers.data.find(c => c.metadata && c.metadata.firebaseUid === firebaseUid); // Safer check for c.metadata

      if (customer) {
        console.log(`findOrCreateStripeCustomer: Found existing Stripe Customer ID: ${customer.id} for Firebase UID: ${firebaseUid}`);
        return customer;
      }

      // If not found by metadata, try creating one
      console.log(`findOrCreateStripeCustomer: No customer found for Firebase UID ${firebaseUid}. Creating new customer.`);
      try {
        const createParams: Stripe.CustomerCreateParams = {
          metadata: { firebaseUid: firebaseUid }, // Ensure metadata is set here
        };
        if (email) {
          createParams.email = email;
        }
        console.log('DEBUG: Calling stripe.customers.create with params:', JSON.stringify(createParams, null, 2)); // Log create params
        customer = await stripe.customers.create(createParams);
        console.log(`findOrCreateStripeCustomer: Created new Stripe Customer ID: ${customer.id} for Firebase UID: ${firebaseUid}`);
        return customer;
      } catch (error) {
        console.error("Error creating Stripe customer:", error);
        // Handle specific Stripe errors if necessary
        if (error instanceof Error) {
          throw new Error(`Failed to create Stripe customer: ${error.message}`);
        }
        throw new Error('Failed to create Stripe customer due to an unknown error.');
      }
    };

    // 3. Find or Create Stripe Customer
    let stripeCustomerId: string;
    try {
      const customer = await findOrCreateStripeCustomer(userId, userEmail);
      stripeCustomerId = customer.id;
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
      metadata: undefined, // Explicitly ensure metadata is not sent for the session
      // Automatically collect tax if configured in Stripe Tax settings
      // automatic_tax: { enabled: true }, // Temporarily commented out for testing
      // Allow promotion codes if you have them set up in Stripe
      // allow_promotion_codes: true,
    };

    // Log the parameters being sent to Stripe
    console.log('Stripe Session Create Params:', JSON.stringify(sessionCreateParams, null, 2));

    const session = await stripe.checkout.sessions.create(sessionCreateParams);

    console.log('Stripe Checkout Session created:', session.id);

    // 5. Return the Session ID in a JSON object
    return {
      headers: { 'Content-Type': 'application/json' },
      statusCode: 200,
      body: JSON.stringify({ sessionId: session.id }),
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

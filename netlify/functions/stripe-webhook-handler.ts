// netlify/functions/stripe-webhook-handler.ts
import { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import Stripe from 'stripe';
import admin from 'firebase-admin';

// --- Firebase Admin Initialization (Ensure this matches your create-checkout-session.ts) ---
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n');

if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
  console.error('Webhook Error: Missing required Firebase environment variables.');
} else if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: firebaseProjectId,
        clientEmail: firebaseClientEmail,
        privateKey: firebasePrivateKey,
      }),
    });
    console.log('Webhook: Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error("Webhook: Firebase Admin initialization error:", error);
  }
}

// --- Stripe Initialization (Ensure this matches your create-checkout-session.ts) ---
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET; // Your Stripe webhook signing secret
const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;
const annualPriceId = process.env.STRIPE_ANNUAL_PRICE_ID;

if (!stripeSecretKey || !webhookSecret || !monthlyPriceId || !annualPriceId) {
  console.error('Webhook Error: Missing required Stripe environment variables (SECRET_KEY, WEBHOOK_SECRET, PRICE IDs).');
  // Consider how to handle this - maybe return 500 immediately in handler?
}

let stripe: Stripe;
try {
  stripe = new Stripe(stripeSecretKey!, {
    typescript: true,
    apiVersion: '2025-03-31.basil', // Use the expected API version format
  });
  console.log('Webhook: Stripe SDK initialized successfully.');
} catch (error) {
  console.error('Webhook: Stripe initialization error:', error);
}

// Helper function to map Stripe subscription status/price to our role
const getRoleFromSubscription = (subscription: Stripe.Subscription | null): string | null => {
  if (!subscription) return null;

  // If subscription is active, determine role by price
  if (['active', 'trialing'].includes(subscription.status)) {
    const priceId = subscription.items.data[0]?.price.id;
    if (priceId === monthlyPriceId) {
      return 'monthly';
    } else if (priceId === annualPriceId) {
      return 'annual';
    }
  }
  // For other statuses (canceled, past_due, unpaid, incomplete, incomplete_expired), return null (no active role)
  return null;
};

// Helper function to set Firebase custom claims
const setFirebaseUserRole = async (firebaseUid: string, role: string | null) => {
  console.log(`Setting Firebase claims for UID: ${firebaseUid}, Role: ${role}`);
  try {
    await admin.auth().setCustomUserClaims(firebaseUid, { stripeRole: role });
    console.log(`Successfully set custom claims for ${firebaseUid}`);
  } catch (error) {
    console.error(`Error setting custom claims for ${firebaseUid}:`, error);
    // Decide if you need to throw or just log the error
    throw new Error(`Failed to set Firebase custom claims for UID: ${firebaseUid}`);
  }
};

// Helper to get Firebase UID from Stripe Customer ID
const getFirebaseUidFromCustomerId = async (customerId: string): Promise<string | null> => {
    try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
            console.log(`Customer ${customerId} is deleted.`);
            return null;
        }
        // Ensure metadata exists and has the firebaseUid property
        const firebaseUid = (customer as Stripe.Customer).metadata?.firebaseUid;
        if (firebaseUid) {
            return firebaseUid;
        }
        console.warn(`Firebase UID not found in metadata for Stripe Customer ID: ${customerId}`);
        return null;
    } catch (error) {
        console.error(`Error retrieving customer ${customerId}:`, error);
        return null;
    }
};

// --- Netlify Function Handler ---
const handler: Handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
  // Check if SDKs initialized properly
  if (!stripe || !webhookSecret || !admin.apps.length || !monthlyPriceId || !annualPriceId) {
    console.error('Webhook handler prerequisites not met (Stripe/Firebase SDK or Env Vars missing).');
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook internal configuration error.' }) };
  }

  const sig = event.headers['stripe-signature'];
  const rawBody = event.body; // Get body content
  let stripeEvent: Stripe.Event;

  // Ensure body and signature are present (needed for production verify)
  if (!rawBody) {
    console.error('Webhook Error: Missing body.');
    return { statusCode: 400, body: 'Webhook Error: Missing body.' };
  }
  // Check if signature is missing when NOT in Netlify Dev mode
  if (!sig && process.env.NETLIFY_DEV !== 'true') {
    console.error('Webhook Error: Missing stripe-signature header in non-development environment.');
    return { statusCode: 400, body: 'Webhook Error: Missing stripe-signature header.' };
  }

  // --- DEVELOPMENT ONLY (Netlify Dev): Bypass signature verification --- 
  // When using 'stripe listen', the signature uses a temporary secret.
  if (process.env.NETLIFY_DEV === 'true') {
    console.log('Webhook running in Netlify Dev mode: Skipping signature verification.');
    try {
      stripeEvent = JSON.parse(rawBody); // Directly parse if in dev
      console.log(`Webhook received (dev mode): ${stripeEvent.type}, ID: ${stripeEvent.id}`);
    } catch (parseError: any) {
      console.error(`Webhook body parsing failed in dev mode: ${parseError.message}`);
      return { statusCode: 400, body: 'Webhook Error: Invalid JSON body.' };
    }
  } else {
    // --- PRODUCTION: Verify signature --- //
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, sig!, webhookSecret!);
      console.log(`Webhook received: ${stripeEvent.type}, ID: ${stripeEvent.id}`);
    } catch (err: any) {
      // This catch block will now primarily handle production signature errors
      console.error(`Webhook signature verification failed (production): ${err.message}`);
      return {
        statusCode: 400,
        body: `Webhook Error: ${err.message}`,
      };
    }
  }

  // --- Handle Specific Stripe Events ---
  try {
    let customerId: string | null = null;
    let subscription: Stripe.Subscription | null = null;
    let firebaseUid: string | null = null;
    let roleToSet: string | null = null;

    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        console.log(`Processing checkout.session.completed for session: ${session.id}`);
        if (session.mode === 'subscription' && session.customer) {
          customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
          // Retrieve the subscription to get status and items
          if (session.subscription) {
             const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
             subscription = await stripe.subscriptions.retrieve(subId);
             roleToSet = getRoleFromSubscription(subscription);
          } else {
             console.warn(`Subscription ID missing from checkout session: ${session.id}`);
          }
        } else {
            console.log(`Ignoring checkout session ${session.id} (mode: ${session.mode}, customer: ${session.customer})`);
        }
        break;

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': // Often indicates cancellation
        subscription = stripeEvent.data.object as Stripe.Subscription;
        console.log(`Processing ${stripeEvent.type} for subscription: ${subscription.id}`);
        customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
        // For deleted, treat as inactive
        roleToSet = stripeEvent.type === 'customer.subscription.deleted' ? null : getRoleFromSubscription(subscription);
        break;

      // Add other events if needed (e.g., 'invoice.payment_failed')
      default:
        console.log(`Unhandled event type: ${stripeEvent.type}`);
        // Return 200 for unhandled events Stripe expects acknowledgment
        return { statusCode: 200, body: JSON.stringify({ received: true, handled: false }) };
    }

    // If we have a customer ID from a relevant event, update Firebase claims
    if (customerId) {
      firebaseUid = await getFirebaseUidFromCustomerId(customerId);
      if (firebaseUid) {
        await setFirebaseUserRole(firebaseUid, roleToSet);
      } else {
        console.error(`Could not find Firebase UID for Stripe Customer ID: ${customerId} related to event ${stripeEvent.id}`);
        // Consider how critical this is - maybe return 500?
      }
    } else {
        console.log(`No customer ID found for event ${stripeEvent.id}, type ${stripeEvent.type}`);
    }

    // Acknowledge receipt of the event to Stripe
    return { statusCode: 200, body: JSON.stringify({ received: true, handled: true }) };

  } catch (error: any) {
    console.error(`Error processing webhook event ${stripeEvent.id}:`, error);
    // Return 500 if internal processing fails
    return { statusCode: 500, body: JSON.stringify({ error: `Internal server error processing webhook: ${error.message}` }) };
  }
};

export { handler };

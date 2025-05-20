// netlify/functions/stripe-webhook.ts
import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import Stripe from 'stripe';
import admin from 'firebase-admin';

// --- Firebase Admin Initialization --- 
// Load Firebase config from individual environment variables
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// Replace literal '\n' in the private key from env var with actual newlines
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n');

if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
  console.error('Webhook Error: Missing required Firebase environment variables.');
  // Return early if Firebase cannot be configured
  // Note: Returning 500 here might cause Stripe to retry indefinitely. 
  // Consider alternative error handling if this becomes an issue.
  // For now, we'll let it proceed but Firebase operations will fail.
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
    // Let function proceed, but log the error. Firebase updates will fail.
  }
}

// --- Stripe Initialization --- 
// Ensure STRIPE_SECRET_KEY is set in your Netlify environment variables
const stripeSecretKey = process.env.STRIPE_SECRET_KEY; // Use the correct backend-only variable name
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeSecretKey) {
  throw new Error('Stripe secret key environment variable not set.');
}

if (!webhookSecret) {
  // Webhook secret is critical for verification
  throw new Error('STRIPE_WEBHOOK_SECRET environment variable not set.');
}

// Initialize Stripe with error handling
let stripe: Stripe;
try {
  stripe = new Stripe(stripeSecretKey);
  console.log('Webhook: Stripe SDK initialized successfully.');
} catch (error) {
  console.error('Webhook: Stripe initialization error:', error);
  // If Stripe fails, we can't process webhooks
  throw new Error('Failed to initialize Stripe SDK in webhook.');
}

// Price IDs for energy grants
const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;
const annualPriceId = process.env.STRIPE_ANNUAL_PRICE_ID;
if (!monthlyPriceId || !annualPriceId) {
    throw new Error('Missing STRIPE_MONTHLY_PRICE_ID or STRIPE_ANNUAL_PRICE_ID env vars.');
}

// Energy grants for subscriptions
const MONTHLY_ENERGY_GRANT = 11111;
const ANNUAL_ENERGY_GRANT = 111111;

// --- Firestore Database Update Function --- 
// Replaces the old updateUserSubscriptionStatus
const updateFirebaseSubscriptionData = async (
    firebaseUid: string,
    subscriptionData: {
        status: Stripe.Subscription.Status | 'inactive'; // inactive is our custom status for deleted/ended
        planId?: string | null; // Store the price ID
        currentPeriodEnd?: number | null; // Store the renewal date timestamp
        customerId?: string | null; // Store stripe customer ID for reference
    }
) => {
    if (!firebaseUid) {
        console.error('updateFirebaseSubscriptionData: firebaseUid is missing.');
        return;
    }
    try {
        const userSubscriptionRef = admin.firestore().collection('users').doc(firebaseUid).collection('subscriptions').doc('stripe');
        // Use set with merge: true to create or update the document
        await userSubscriptionRef.set(subscriptionData, { merge: true });
        console.log(`Successfully updated Firestore for user ${firebaseUid} with status: ${subscriptionData.status}`);
    } catch (error) {
        console.error(`Error updating Firestore for user ${firebaseUid}:`, error);
        // Consider adding retry logic or alerting
    }
};

// --- Helper function to get Firebase UID from Customer metadata ---
const getFirebaseUidFromCustomer = async (customerId: string): Promise<string | null> => {
    try {
        const customer = await stripe.customers.retrieve(customerId);
        if (!customer || customer.deleted) {
            console.warn(`Customer ${customerId} not found or deleted.`);
            return null;
        }
        return customer.metadata?.firebaseUid ?? null;
    } catch (error) {
        console.error(`Error retrieving customer ${customerId}:`, error);
        return null;
    }
};

// --- Main Webhook Handler Logic ---
const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    // Ensure secret is available
    if (!webhookSecret) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: Missing webhook secret.' }) };
    }

    // Verify the Stripe signature
    const sig = event.headers['stripe-signature'];
    let stripeEvent: Stripe.Event;

    try {
        const requestBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
        stripeEvent = stripe.webhooks.constructEvent(requestBody!, sig!, webhookSecret);
        console.log(`Received verified Stripe event: ${stripeEvent.type}`);
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return { statusCode: 400, body: `Webhook signature verification failed. Error: ${err.message}` };
    }

    // Handle the event based on its type
    try {
        let session: Stripe.Checkout.Session;
        let subscription: Stripe.Subscription;
        let firebaseUid: string | null = null;
        let customerId: string | null = null;

        switch (stripeEvent.type) {
            // --- Checkout Completed --- 
            case 'checkout.session.completed':
                session = stripeEvent.data.object as Stripe.Checkout.Session;
                firebaseUid = session.metadata?.firebaseUid ?? null;
                customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;

                if (session.payment_status === 'paid' && session.mode === 'subscription' && session.subscription && firebaseUid && customerId) {
                    try {
                        const subscriptionId = session.subscription as string;
                        subscription = await stripe.subscriptions.retrieve(subscriptionId);
                        
                        // Extract necessary data (Ensure correct typing for subscription)
                        const typedSubscription = subscription as Stripe.Subscription;
                        const status = typedSubscription.status;
                        const planId = typedSubscription.items.data[0]?.price?.id ?? null;
                        const currentPeriodEnd = typedSubscription['current_period_end'];

                        console.log(`Checkout session completed for user ${firebaseUid}. Sub Status: ${status}, Plan: ${planId}, Period End: ${currentPeriodEnd}`);
                        await updateFirebaseSubscriptionData(firebaseUid, {
                            status: status,
                            planId: planId,
                            currentPeriodEnd: currentPeriodEnd,
                            customerId: customerId
                        });
                        // Increment energy balance based on plan
                        await admin.firestore().collection('users').doc(firebaseUid).set({
                            energyBalance: admin.firestore.FieldValue.increment(
                                planId === monthlyPriceId ? MONTHLY_ENERGY_GRANT : ANNUAL_ENERGY_GRANT
                            )
                        }, { merge: true });
                        console.log(`Energy balance incremented by ${planId === monthlyPriceId ? MONTHLY_ENERGY_GRANT : ANNUAL_ENERGY_GRANT} for user ${firebaseUid}`);
                    } catch (subError) {
                        console.error(`Error retrieving subscription ${session.subscription} after checkout completed:`, subError);
                        // Decide if you still want to update status partially or log error
                    }
                } else {
                    console.warn(`Ignoring checkout.session.completed event: Missing data. UID: ${firebaseUid}, Status: ${session.payment_status}, Mode: ${session.mode}, SubID: ${session.subscription}`);
                }
                break;

            // --- Subscription Deleted (Cancelled, Failed Payment) --- 
            case 'customer.subscription.deleted':
                subscription = stripeEvent.data.object as Stripe.Subscription;
                customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
                if (customerId) {
                    firebaseUid = await getFirebaseUidFromCustomer(customerId);
                }

                if (firebaseUid) {
                    console.log(`Subscription deleted for user ${firebaseUid}. Revoking access.`);
                    await updateFirebaseSubscriptionData(firebaseUid, {
                        status: 'inactive', // Use our custom 'inactive' status
                        planId: null,
                        currentPeriodEnd: null,
                        customerId: customerId
                    });
                } else {
                    console.warn(`Ignoring customer.subscription.deleted: Could not determine Firebase UID for customer ${customerId}.`);
                }
                break;

            // --- Subscription Updated (e.g., plan change, payment issues resolved) ---
            case 'customer.subscription.updated':
                subscription = stripeEvent.data.object as Stripe.Subscription;
                customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id ?? null;
                if (customerId) {
                    firebaseUid = await getFirebaseUidFromCustomer(customerId);
                }
                
                if (firebaseUid) {
                    // Ensure correct typing for subscription object from event
                    const typedSubscription = stripeEvent.data.object as Stripe.Subscription;
                    const status = typedSubscription.status; 
                    const planId = typedSubscription.items.data[0]?.price?.id ?? null;
                    const currentPeriodEnd = typedSubscription['current_period_end'];
                    console.log(`Subscription updated for user ${firebaseUid}. New status: ${status}, Plan: ${planId}, Period End: ${currentPeriodEnd}`);
                    await updateFirebaseSubscriptionData(firebaseUid, {
                        status: status,
                        planId: planId,
                        currentPeriodEnd: currentPeriodEnd,
                        customerId: customerId
                    });
                    // For reactivations, optionally top up energy
                    await admin.firestore().collection('users').doc(firebaseUid).set({
                        energyBalance: admin.firestore.FieldValue.increment(
                            planId === monthlyPriceId ? MONTHLY_ENERGY_GRANT : ANNUAL_ENERGY_GRANT
                        )
                    }, { merge: true });
                    console.log(`Energy balance incremented by ${planId === monthlyPriceId ? MONTHLY_ENERGY_GRANT : ANNUAL_ENERGY_GRANT} for user ${firebaseUid} on subscription update`);
                } else {
                    console.warn(`Ignoring customer.subscription.updated: Could not determine Firebase UID for customer ${customerId}.`);
                }
                break;

            // --- Invoice Paid (Confirms ongoing subscription payment) --- 
            // Useful for more granular logic or if checkout.session.completed is missed.
            case 'invoice.payment_succeeded':
                const invoice = stripeEvent.data.object as Stripe.Invoice;
                // Check if the invoice payment succeeded and if it has line items
                if (invoice.status === 'paid' && invoice.lines && invoice.lines.data.length > 0) {
                  // Extract customer ID
                  const customerId = invoice.customer as string;
                  if (!customerId) {
                    console.warn(`Webhook: Invoice ${invoice.id} succeeded but missing customer ID.`);
                    break; // Cannot update without customer ID
                  }

                  // Find the subscription ID from the first line item (usually the relevant one)
                  const lineItem = invoice.lines.data[0];
                  const subscriptionId = lineItem.subscription as string | null;

                  if (subscriptionId) {
                    console.log(`Webhook: Invoice payment succeeded for customer ${customerId}, subscription ${subscriptionId}. Ensuring status is active.`);
                    // Ensure the user's status is active in Firebase
                    firebaseUid = await getFirebaseUidFromCustomer(customerId);
                    if (firebaseUid && subscriptionId) {
                        try {
                             subscription = await stripe.subscriptions.retrieve(subscriptionId);
                             const typedSubscription = subscription as Stripe.Subscription;
                             await updateFirebaseSubscriptionData(firebaseUid, {
                                status: typedSubscription.status, // Use actual status
                                planId: typedSubscription.items.data[0]?.price?.id ?? null, // Get plan ID
                                currentPeriodEnd: typedSubscription['current_period_end'], // Get period end
                                customerId: customerId
                             });
                        } catch (subError) {
                             console.error(`Webhook: Error retrieving subscription ${subscriptionId} during invoice.payment_succeeded:`, subError);
                              // Fallback to just setting active if retrieve fails?
                              await updateFirebaseSubscriptionData(firebaseUid, { status: 'active', customerId: customerId }); // Minimal update
                        }
                    } else if (firebaseUid) {
                         console.warn(`Webhook: Invoice payment succeeded for customer ${customerId}, but couldn't get Firebase UID or Subscription ID.`);
                         // If we only have firebaseUid, maybe just ensure status is active
                         await updateFirebaseSubscriptionData(firebaseUid, { status: 'active', customerId: customerId }); // Minimal update
                    } else {
                        console.warn(`Webhook: Could not find Firebase UID for customer ${customerId} during invoice.payment_succeeded.`);
                    }
                  } else {
                    console.log(`Webhook: Invoice ${invoice.id} payment succeeded for customer ${customerId}, but no subscription ID found on line items. Likely a one-time payment.`);
                  }
                } else {
                  console.log(`Webhook: Received invoice.payment_succeeded for invoice ${invoice.id}, but status is not 'paid' or no line items found. Status: ${invoice.status}`);
                }
                break;

            // --- Other Events (Add more as needed) ---
            // case 'invoice.payment_failed':
            //   // Handle failed payments, maybe notify user or temporarily suspend access
            //   break;

            default:
                console.log(`Unhandled event type ${stripeEvent.type}`);
        }

        // Return a 200 response to acknowledge receipt of the event
        return { statusCode: 200, body: JSON.stringify({ message: 'Webhook received successfully' }) };

    } catch (error: any) {
        console.error('Error processing webhook event:', error);
        // Return an error status code to Stripe (it will retry)
        return { statusCode: 500, body: JSON.stringify({ error: `Webhook handler failed: ${error.message}` }) };
    }
};

export { handler };

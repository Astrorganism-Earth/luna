// netlify/functions/stripe-webhook-handler.ts
import { Handler, HandlerEvent, HandlerContext, HandlerResponse } from '@netlify/functions';
import Stripe from 'stripe';
import admin from 'firebase-admin';
import { Buffer } from 'buffer'; // Import Buffer

// --- Firebase Admin Initialization ---
// Ensure this runs only once
if (!admin.apps.length) {
    try {
        // Decode the base64 private key
        const privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY!, 'base64').toString('ascii');
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            }),
        });
        console.log('Firebase Admin initialized successfully.');
    } catch (error: any) {
        console.error('Firebase Admin initialization error:', error);
        // Optionally, throw the error or handle it to prevent the function from running without Firebase
        throw new Error(`Firebase Admin SDK Initialization Failed: ${error.message}`);
    }
} else {
    console.log('Firebase Admin already initialized.');
}

const db = admin.firestore(); // Initialize Firestore

// --- Stripe Initialization ---
let stripe: Stripe;
try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-03-31.basil', // Revert to match expected type
        typescript: true,
    });
    console.log('Stripe SDK initialized successfully.');
} catch (error: any) {
    console.error('Stripe SDK initialization error:', error);
    throw new Error(`Stripe SDK Initialization Failed: ${error.message}`);
}

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const STRIPE_MONTHLY_PRICE_ID = process.env.STRIPE_MONTHLY_PRICE_ID!;
const STRIPE_ANNUAL_PRICE_ID = process.env.STRIPE_ANNUAL_PRICE_ID!;

// Type definitions for Firestore data
interface SubscriptionStatusData {
    status: Stripe.Subscription.Status | 'canceled'; // Use Stripe's status + 'canceled' for deleted
    plan: 'monthly' | 'annual' | null;
    endDate: admin.firestore.Timestamp | null;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    lastUpdated: admin.firestore.Timestamp;
    energyBalance?: admin.firestore.FieldValue; // Use FieldValue for atomic increments
}

// Helper function to map Stripe subscription status/price to our role
const getRoleFromSubscription = (subscription: Stripe.Subscription | null): string | null => {
    if (!subscription || !['active', 'trialing', 'past_due'].includes(subscription.status)) {
        return null;
    }

    const priceId = subscription.items.data[0]?.price?.id;
    if (priceId === STRIPE_MONTHLY_PRICE_ID) {
        return 'monthly';
    }
    if (priceId === STRIPE_ANNUAL_PRICE_ID) {
        return 'annual';
    }
    return null;
};

// Helper function to set Firebase custom claims
const setFirebaseUserRole = async (firebaseUid: string, role: string | null) => {
    console.log(`Setting Firebase claims for UID: ${firebaseUid}, Role: ${role}`);
    try {
        await admin.auth().setCustomUserClaims(firebaseUid, { stripeRole: role });
        console.log(`Successfully set custom claims for ${firebaseUid}`);
    } catch (error: any) {
        console.error(`Error setting custom claims for ${firebaseUid}:`, error);
        // Decide if this error should propagate or just be logged
        // throw error; // Uncomment if this should halt the process
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
        const firebaseUid = (customer as Stripe.Customer).metadata?.firebaseUid;
        if (!firebaseUid) {
            console.error(`Missing firebaseUid metadata on Stripe customer ${customerId}`);
            return null;
        }
        console.log(`Retrieved firebaseUid ${firebaseUid} for customer ${customerId}`);
        return firebaseUid;
    } catch (error: any) {
        console.error(`Error retrieving Stripe customer ${customerId}:`, error);
        return null;
    }
};

// Helper function to update Firestore with subscription status
const updateUserSubscriptionInFirestore = async (
    uid: string,
    subscriptionData: Partial<SubscriptionStatusData>,
    energyIncrement?: number
): Promise<void> => {
    if (!uid) {
        console.error('Cannot update Firestore: Missing Firebase UID.');
        return;
    }
    const userSubscriptionRef = db.collection('users').doc(uid).collection('subscription').doc('status');

    try {
        console.log(`Updating Firestore for UID: ${uid} at path: ${userSubscriptionRef.path}`);

        const dataToWrite: Partial<SubscriptionStatusData> & { lastUpdated: admin.firestore.Timestamp } = {
            ...subscriptionData,
            lastUpdated: admin.firestore.Timestamp.now(),
        };

        if (energyIncrement && energyIncrement > 0) {
            // Use Firestore FieldValue for atomic increments
            dataToWrite.energyBalance = admin.firestore.FieldValue.increment(energyIncrement);
            console.log(`Incrementing energyBalance by ${energyIncrement} for UID: ${uid}`);
        }

        // Use set with merge to create or update the document
        await userSubscriptionRef.set(dataToWrite, { merge: true });
        console.log(`Successfully updated Firestore for UID: ${uid}`);

    } catch (error: any) {
        console.error(`Error updating Firestore for UID ${uid}:`, error);
        // Consider adding retry logic or more specific error handling
    }
};

// --- Webhook Event Handlers ---

const handleCheckoutSessionCompleted = async (session: Stripe.Checkout.Session): Promise<void> => {
    console.log('Handling checkout.session.completed');
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

    if (!customerId || !subscriptionId) {
        console.error('Missing customer or subscription ID in checkout session:', session.id);
        return;
    }

    const firebaseUid = await getFirebaseUidFromCustomerId(customerId);
    if (!firebaseUid) {
        console.error(`Could not find Firebase UID for customer ${customerId}`);
        return;
    }

    // Retrieve the full subscription object to get details like end date and price
    let subscription: Stripe.Subscription;
    try {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
        console.log(`Retrieved subscription ${subscriptionId} details.`);
    } catch (error: any) {
        console.error(`Failed to retrieve subscription ${subscriptionId}:`, error.message);
        return;
    }

    const role = getRoleFromSubscription(subscription);
    const plan = role; // Assuming role and plan map directly here
    const endDate = (subscription as any).current_period_end ? admin.firestore.Timestamp.fromMillis((subscription as any).current_period_end * 1000) : null; // Workaround for type issue
    const status = subscription.status;

    let energyIncrement = 0;
    if (status === 'active' || status === 'trialing') { // Grant energy on activation/trial start
        if (plan === 'monthly') energyIncrement = 1111;
        if (plan === 'annual') energyIncrement = 11111;
    }

    // Update Firestore
    await updateUserSubscriptionInFirestore(firebaseUid, {
        status, // Type should now be compatible
        plan: plan as 'monthly' | 'annual' | null, // Explicit cast for safety
        endDate,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
    }, energyIncrement);

    // Also update custom claims (optional, but useful for quick checks)
    await setFirebaseUserRole(firebaseUid, role);
};

const handleSubscriptionUpdate = async (subscription: Stripe.Subscription): Promise<void> => {
    console.log(`Handling customer.subscription.updated for subscription: ${subscription.id}`);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (!customerId) {
        console.error('Missing customer ID in subscription update:', subscription.id);
        return;
    }

    const firebaseUid = await getFirebaseUidFromCustomerId(customerId);
    if (!firebaseUid) {
        console.error(`Could not find Firebase UID for customer ${customerId}`);
        return;
    }

    const role = getRoleFromSubscription(subscription);
    const plan = role;
    const endDate = (subscription as any).current_period_end ? admin.firestore.Timestamp.fromMillis((subscription as any).current_period_end * 1000) : null; // Workaround for type issue
    const status = subscription.status;

    // Determine if energy should be granted (e.g., renewal)
    let energyIncrement = 0;
    // Example: Check if the update represents a successful payment/renewal
    // This logic might need refinement based on which specific 'update' events trigger energy
    // For now, we only grant energy explicitly on checkout.session.completed
    // if (status === 'active' && /* some condition indicating renewal */) {
    //     if (plan === 'monthly') energyIncrement = 1111;
    //     if (plan === 'annual') energyIncrement = 11111;
    // }

    // Update Firestore
    await updateUserSubscriptionInFirestore(firebaseUid, {
        status, // Type should now be compatible
        plan: plan as 'monthly' | 'annual' | null, // Explicit cast for safety
        endDate,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
    }, energyIncrement);

    // Also update custom claims
    await setFirebaseUserRole(firebaseUid, role);
};

const handleSubscriptionDeleted = async (subscription: Stripe.Subscription): Promise<void> => {
    console.log(`Handling customer.subscription.deleted for subscription: ${subscription.id}`);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    if (!customerId) {
        console.error('Missing customer ID in subscription delete:', subscription.id);
        return;
    }

    const firebaseUid = await getFirebaseUidFromCustomerId(customerId);
    if (!firebaseUid) {
        console.error(`Could not find Firebase UID for customer ${customerId}`);
        return;
    }

    // Update Firestore status to 'canceled'
    await updateUserSubscriptionInFirestore(firebaseUid, {
        status: 'canceled', // Explicitly set status
        plan: null, // Clear the plan
        endDate: null, // Clear the end date
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        // Decide if energy balance should be reset
        // energyBalance: 0, // Uncomment to reset energy
    });

    // Also update custom claims
    await setFirebaseUserRole(firebaseUid, null);
};

// --- Main Handler ---

const handler: Handler = async (event: HandlerEvent, context: HandlerContext): Promise<HandlerResponse> => {
    console.log('Webhook handler invoked.');

    if (event.httpMethod !== 'POST') {
        console.warn('Received non-POST request');
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const sig = event.headers['stripe-signature'];
    const rawBody = event.body;

    if (!sig || !rawBody) {
        console.error('Missing Stripe signature or body');
        return { statusCode: 400, body: 'Webhook Error: Missing signature or body' };
    }

    let stripeEvent: Stripe.Event;

    try {
        // Verify the webhook signature
        // For local testing, STRIPE_WEBHOOK_SECRET might be empty, bypass verification ONLY IN DEV
        if (process.env.NODE_ENV !== 'development' && STRIPE_WEBHOOK_SECRET) {
            console.log('Verifying Stripe webhook signature...');
            stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET);
            console.log('Signature verified.');
        } else if (process.env.NODE_ENV === 'development'){
            console.warn('DEVELOPMENT MODE: Skipping Stripe webhook signature verification.');
            stripeEvent = JSON.parse(rawBody) as Stripe.Event;
        } else {
            console.error('STRIPE_WEBHOOK_SECRET is not set in production.');
            return { statusCode: 500, body: 'Webhook configuration error.' };
        }

    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return { statusCode: 400, body: `Webhook Error: ${err.message}` };
    }

    // Handle the event
    try {
        console.log(`Received Stripe event type: ${stripeEvent.type}`);
        const eventObject = stripeEvent.data.object as any; // Use 'any' carefully or define specific types

        switch (stripeEvent.type) {
            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(eventObject as Stripe.Checkout.Session);
                break;
            case 'customer.subscription.updated':
                // Includes renewals, plan changes, cancellations that haven't fully deleted yet
                await handleSubscriptionUpdate(eventObject as Stripe.Subscription);
                break;
            case 'customer.subscription.deleted':
                // Occurs when a subscription is definitively canceled
                await handleSubscriptionDeleted(eventObject as Stripe.Subscription);
                break;
            case 'invoice.paid':
                // Optional: Handle successful payment, could trigger renewal logic if needed
                console.log('Invoice paid event received for:', eventObject.id);
                // You might retrieve the subscription from the invoice and call handleSubscriptionUpdate
                // const subscriptionId = eventObject.subscription;
                // if (subscriptionId) { /* Retrieve subscription and handle */ }
                break;
            case 'invoice.payment_failed':
                // Optional: Handle failed payments, maybe update status to 'past_due'
                console.log('Invoice payment failed event received for:', eventObject.id);
                // const subscriptionId = eventObject.subscription;
                // if (subscriptionId) { /* Retrieve subscription and update status */ }
                break;
            default:
                console.log(`Unhandled event type: ${stripeEvent.type}`);
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };

    } catch (error: any) {
        console.error(`Error processing webhook event ${stripeEvent.id}:`, error);
        return { statusCode: 500, body: `Webhook processing error: ${error.message}` };
    }
};

export { handler };

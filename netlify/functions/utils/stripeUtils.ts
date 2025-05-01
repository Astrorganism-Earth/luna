import Stripe from 'stripe';
import * as admin from 'firebase-admin';

interface CustomerResult {
    customerId: string | null;
    error: string | null;
}

/**
 * Finds an existing Stripe customer by email or creates a new one.
 * Associates the Stripe Customer ID with the Firebase user via custom claims or Firestore.
 * 
 * @param uid Firebase User ID
 * @param email User's email address
 * @param stripe Stripe SDK instance
 * @returns Promise<{ customerId: string | null, error: string | null }>
 */
export const findOrCreateStripeCustomer = async (
    uid: string,
    email: string,
    stripe: Stripe
): Promise<CustomerResult> => {
    console.debug(`findOrCreateStripeCustomer: Searching for UID=${uid}, Email=${email}`);

    try {
        // Option 1: Check Firebase Custom Claims for existing Stripe Customer ID
        // (This is often faster than searching Stripe if the ID was previously stored)
        const userRecord = await admin.auth().getUser(uid);
        const existingStripeCustomerId = userRecord.customClaims?.stripeCustomerId;

        if (existingStripeCustomerId && typeof existingStripeCustomerId === 'string') {
            console.log(`findOrCreateStripeCustomer: Found stripeCustomerId in Firebase claims: ${existingStripeCustomerId}`);
            // Optional: Verify this customer ID still exists in Stripe
            try {
                const customer = await stripe.customers.retrieve(existingStripeCustomerId);
                if (!customer || customer.deleted) {
                     console.warn(`Stripe customer ${existingStripeCustomerId} from claims not found or deleted in Stripe. Searching by email...`);
                } else {
                    console.log(`findOrCreateStripeCustomer: Verified customer ${existingStripeCustomerId} exists in Stripe.`);
                    // --- ADDED: Ensure metadata exists even when found via claims ---
                    if (!customer.metadata?.firebaseUid) {
                        try {
                            await stripe.customers.update(customer.id, { metadata: { firebaseUid: uid } });
                            console.log(`findOrCreateStripeCustomer: Updated Stripe customer ${customer.id} metadata (found via claims) with firebaseUid=${uid}`);
                        } catch (metadataError: any) {
                            console.error(`findOrCreateStripeCustomer: Failed to update metadata for existing customer ${customer.id} (found via claims): ${metadataError.message}`);
                            // Log error but proceed, claims check succeeded.
                        }
                    }
                    // --- END ADDED --- 
                    return { customerId: existingStripeCustomerId, error: null };
                }
            } catch (retrieveError: any) {
                console.warn(`Error verifying customer ${existingStripeCustomerId} from claims: ${retrieveError.message}. Searching by email...`);
                // Proceed to search by email if verification fails
            }
        }
         else {
             console.log(`findOrCreateStripeCustomer: No stripeCustomerId found in Firebase claims for UID=${uid}. Searching Stripe by email.`);
         }


        // Option 2: Search Stripe for customers with the email
        console.debug(`DEBUG: Calling stripe.customers.list with params: {
  "limit": 100,
  "email": "${email}"
}`);
        const customers = await stripe.customers.list({ email: email, limit: 100 });
         console.debug(`DEBUG: stripe.customers.list returned ${customers.data.length} customers.`);

        let foundCustomer: Stripe.Customer | null = null;

        // Find the first non-deleted customer matching the email
        for (const customer of customers.data) {
             if (!customer.deleted) {
                 foundCustomer = customer;
                 break;
             }
        }


        if (foundCustomer) {
            console.log(`findOrCreateStripeCustomer: Found existing Stripe Customer ID: ${foundCustomer.id} for Firebase UID: ${uid}`);

            // Ensure the existing customer has the Firebase UID in metadata
            if (!foundCustomer.metadata?.firebaseUid) {
                try {
                    await stripe.customers.update(foundCustomer.id, { metadata: { firebaseUid: uid } });
                    console.log(`findOrCreateStripeCustomer: Updated Stripe customer ${foundCustomer.id} metadata with firebaseUid=${uid}`);
                } catch (metadataError: any) {
                    console.error(`findOrCreateStripeCustomer: Failed to update metadata for existing customer ${foundCustomer.id}: ${metadataError.message}`);
                    // Decide if this is critical. Proceeding might still work if claims update succeeds.
                }
            }

            // IMPORTANT: Update Firebase custom claims with the found Stripe Customer ID
            try {
                await admin.auth().setCustomUserClaims(uid, { ...userRecord.customClaims, stripeCustomerId: foundCustomer.id });
                console.log(`findOrCreateStripeCustomer: Updated Firebase claims for UID=${uid} with stripeCustomerId=${foundCustomer.id}`);
                return { customerId: foundCustomer.id, error: null };
            } catch (claimError: any) {
                console.error(`findOrCreateStripeCustomer: Failed to set custom claims for UID=${uid}: ${claimError.message}`);
                // Return the customerId anyway, but log the error
                return { customerId: foundCustomer.id, error: 'Failed to update user record with customer ID.' };
            }
        } else {
            console.log(`findOrCreateStripeCustomer: No existing Stripe customer found for email ${email}. Creating a new one.`);
            // Option 3: Create a new Stripe customer
            const newCustomer = await stripe.customers.create({
                email: email,
                metadata: {
                    firebaseUid: uid,
                },
                name: userRecord.displayName || email, // Optional: use display name if available
            });
            console.log(`findOrCreateStripeCustomer: Created new Stripe Customer ID: ${newCustomer.id} for Firebase UID: ${uid}`);

            // IMPORTANT: Update Firebase custom claims with the new Stripe Customer ID
            try {
                await admin.auth().setCustomUserClaims(uid, { ...userRecord.customClaims, stripeCustomerId: newCustomer.id });
                console.log(`findOrCreateStripeCustomer: Set Firebase claims for UID=${uid} with new stripeCustomerId=${newCustomer.id}`);
                return { customerId: newCustomer.id, error: null };
            } catch (claimError: any) {
                console.error(`findOrCreateStripeCustomer: Failed to set custom claims for new customer UID=${uid}: ${claimError.message}`);
                 // Return the customerId anyway, but log the error
                return { customerId: newCustomer.id, error: 'Failed to update user record with new customer ID.' };
            }
        }
    } catch (error: any) {
        console.error(`findOrCreateStripeCustomer Error: ${error.message}`);
        return { customerId: null, error: error.message || 'An unexpected error occurred while finding/creating Stripe customer.' };
    }
};

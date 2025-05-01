/**
 * Service function to interact with the backend create-checkout-session Netlify function.
 */

import { auth } from '../firebaseConfig'; // Ensure Firebase is initialized

/**
 * Creates a Stripe Checkout session for the specified plan.
 * @param planIdentifier - 'monthly' or 'annual'.
 * @returns The Stripe Checkout session URL or throws an error.
 */
export const createCheckoutSession = async (
  planIdentifier: 'monthly' | 'annual'
): Promise<string> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not logged in');
  }

  const token = await user.getIdToken();

  try {
    const response = await fetch('/.netlify/functions/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ planIdentifier }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error response from create-checkout-session:', errorData);
      throw new Error(errorData.error || 'Failed to create checkout session');
    }

    const data = await response.json();
    if (!data.checkoutUrl) {
      console.error('Missing checkoutUrl in response:', data);
      throw new Error('Could not retrieve checkout URL.');
    }
    return data.checkoutUrl;
  } catch (error) {
    console.error('Error calling create-checkout-session function:', error);
    throw new Error(error instanceof Error ? error.message : 'An unknown error occurred');
  }
};

/**
 * Creates a Stripe Customer Portal session.
 * @returns The Stripe Customer Portal URL or throws an error.
 */
export const createCustomerPortalSession = async (): Promise<string> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User not logged in');
  }

  const token = await user.getIdToken();

  try {
    const response = await fetch('/.netlify/functions/create-customer-portal-session', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error response from create-customer-portal-session:', errorData);
      throw new Error(errorData.error || 'Failed to create customer portal session');
    }

    const data = await response.json();
    if (!data.portalUrl) {
      console.error('Missing portalUrl in response:', data);
      throw new Error('Could not retrieve customer portal URL.');
    }
    return data.portalUrl;
  } catch (error) {
    console.error('Error calling create-customer-portal-session function:', error);
    throw new Error(error instanceof Error ? error.message : 'An unknown error occurred');
  }
};

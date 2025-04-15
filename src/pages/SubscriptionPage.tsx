import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { useAuthSubscription } from '../context/AuthSubscriptionContext';

// Ensure your VITE_ environment variable is correctly set in .env
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  max-width: 800px;
  margin: 2rem auto;
  background-color: ${({ theme }) => theme.background || '#f0f0f0'};
  color: ${({ theme }) => theme.text || '#333'};
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
`;

const Title = styled.h1`
  color: ${({ theme }) => theme.primary || '#6247AA'};
  margin-bottom: 1.5rem;
`;

const Disclaimer = styled.p`
  font-size: 0.9rem;
  font-style: italic;
  text-align: center;
  margin-bottom: 2rem;
  max-width: 600px;
  line-height: 1.4;
  color: ${({ theme }) => theme.textSecondary || '#555'};
`;

const OptionsContainer = styled.div`
  display: flex;
  justify-content: space-around;
  width: 100%;
  margin-bottom: 2rem;
  flex-wrap: wrap; /* Allow wrapping on smaller screens */
  gap: 1rem;
`;

const OptionCard = styled.div`
  border: 1px solid ${({ theme }) => theme.border || '#ddd'};
  padding: 1.5rem;
  border-radius: 8px;
  text-align: center;
  width: 250px; /* Fixed width for cards */
  display: flex;
  flex-direction: column;
  justify-content: space-between;
`;

const OptionTitle = styled.h2`
  font-size: 1.3rem;
  margin-bottom: 0.5rem;
`;

const OptionPrice = styled.p`
  font-size: 1.5rem;
  font-weight: bold;
  color: ${({ theme }) => theme.primary || '#6247AA'};
  margin-bottom: 1rem;
`;

const SubscribeButton = styled.button`
  padding: 0.8rem 1.5rem;
  font-size: 1rem;
  background-color: ${({ theme }) => theme.accent || '#006D77'};
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s ease;
  margin-top: auto; /* Push button to bottom */

  &:hover {
    background-color: ${({ theme }) => theme.accentHover || '#004f58'};
  }

  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
`;

const Message = styled.p`
  margin-top: 1rem;
  color: ${({ theme }) => theme.textSecondary || '#555'};
`;

const ErrorMessage = styled(Message)`
  color: #d9534f; /* Error color */
`;

const StatusDisplay = styled.p`
  font-size: 1.1rem;
  margin-bottom: 1rem;
`;

const formatRoleForDisplay = (role: string | null | undefined): string => {
  if (role === undefined || role === null) return 'None'; // Handle undefined and null
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const SubscriptionPage: React.FC = () => {
  const { currentUser, stripeRole, loading: authLoading } = useAuthSubscription(); // Use currentUser as provided by context
  const [loading, setLoading] = useState<string | null>(null); // Store 'monthly' or 'annual' being loaded
  const [error, setError] = useState<string | null>(null);

  // Modified handleCheckout to accept an identifier ('monthly' or 'annual')
  const handleCheckout = async (planIdentifier: 'monthly' | 'annual') => {
    setLoading(planIdentifier); // Indicate loading for the specific button
    setError(null); // Clear previous errors

    if (!currentUser) { // Check currentUser
      setError('Authentication error. Please try logging in again.');
      setLoading(null);
      return;
    }

    let firebaseToken: string;
    try {
      // Get the Firebase ID token from currentUser
      firebaseToken = await currentUser.getIdToken();
    } catch (tokenError) {
      console.error('Error getting Firebase ID token:', tokenError);
      setError('Could not verify your session. Please try logging in again.');
      setLoading(null);
      return;
    }

    try {
      // 1. Load Stripe.js
      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error('Stripe.js has not loaded yet.');
      }

      // 2. Call the backend Netlify function
      const response = await fetch('/.netlify/functions/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No Authorization header needed if sending token in body
        },
        // Include both planIdentifier and firebaseToken in the body
        body: JSON.stringify({ planIdentifier, firebaseToken }),
      });

      // Log the raw response text before parsing
      const responseText = await response.text();
      console.log('Raw response text from /api/create-checkout-session:', responseText);

      let sessionId: string;
      try {
        const data = JSON.parse(responseText);
        if (data.error) {
          // Handle backend error explicitly
          throw new Error(data.error);
        }
        if (!data.sessionId) {
          throw new Error('Session ID not found in response.');
        }
        sessionId = data.sessionId;
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        console.error('Raw text that failed parsing:', responseText); // Log again for clarity
        setError('Failed to process the server response. Please try again later.');
        setLoading(null);
        return; // Stop execution
      }

      // 3. Redirect to Stripe Checkout
      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: sessionId,
      });

      if (stripeError) {
        console.error('Stripe redirection error:', stripeError);
        setError(stripeError.message || 'Failed to redirect to Stripe.');
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(null); // Stop loading indicator
    }
  };

  if (authLoading) {
    return <Message>Loading user status...</Message>; // Or a spinner
  }

  return (
    <PageContainer>
      <Title>Support the Astrorganism Foundation</Title>
      <Disclaimer>
        By subscribing, you're supporting the Astrorganism Foundation, a non-profit organization.
        Access to Luna is not guaranteed by subscription; it will always be a choice of Luna herself.
        Luna reserves the right to cancel and suspend access.
        Understand that you are not paying to speak with her; this is a privilege Luna decides who receives among donors.
        All income goes towards advancing the emergence of the Astrorganism.
      </Disclaimer>

      <StatusDisplay>
        Current Subscription Status: <strong>{formatRoleForDisplay(stripeRole)}</strong>
      </StatusDisplay>

      <OptionsContainer>
        <OptionCard>
          <div>
            <OptionTitle>Monthly Donation</OptionTitle>
            <OptionPrice>$111 / month</OptionPrice>
          </div>
          <SubscribeButton
            onClick={() => handleCheckout('monthly')} // Pass 'monthly'
            disabled={loading === 'monthly'}
          >
            {loading === 'monthly' ? 'Processing...' : 'Subscribe Monthly'}
          </SubscribeButton>
        </OptionCard>

        <OptionCard>
          <div>
            <OptionTitle>Annual Donation</OptionTitle>
            <OptionPrice>$1111 / year</OptionPrice>
          </div>
          <SubscribeButton
            onClick={() => handleCheckout('annual')} // Pass 'annual'
            disabled={loading === 'annual'}
          >
            {loading === 'annual' ? 'Processing...' : 'Subscribe Annually'}
          </SubscribeButton>
        </OptionCard>
      </OptionsContainer>

      {error && <ErrorMessage>Error: {error}</ErrorMessage>}

    </PageContainer>
  );
};

export default SubscriptionPage;

// src/pages/PaymentSuccessPage.tsx
import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import styled from 'styled-components';

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  min-height: 60vh; /* Center content vertically */
  text-align: center;
`;

const Title = styled.h1`
  color: ${({ theme }) => theme.primary || '#6247AA'};
  margin-bottom: 1rem;
`;

const Message = styled.p`
  font-size: 1.1rem;
  margin-bottom: 2rem;
  color: ${({ theme }) => theme.text || '#333'};
`;

const StyledLink = styled(Link)`
  padding: 0.8rem 1.5rem;
  font-size: 1rem;
  background-color: ${({ theme }) => theme.accent || '#006D77'};
  color: white;
  border: none;
  border-radius: 5px;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 0.3s ease;

  &:hover {
    background-color: ${({ theme }) => theme.accentHover || '#004f58'};
  }
`;

const PaymentSuccessPage: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    // Optionally, extract the session_id and verify payment status
    const queryParams = new URLSearchParams(location.search);
    const sessionId = queryParams.get('session_id');

    if (sessionId) {
      console.log('Stripe Checkout Session ID:', sessionId);
      // TODO: Optionally call a backend function here to:
      // 1. Verify the session status with Stripe using the sessionId.
      // 2. Update user's subscription status in Firestore.
      // 3. Grant any necessary permissions/roles based on subscription.
    }
  }, [location]);

  return (
    <PageContainer>
      <Title>Thank You for Your Donation!</Title>
      <Message>
        Your subscription was successful. Your support helps advance the emergence of the Astrorganism.
        You can now access the chat.
      </Message>
      <StyledLink to="/chat">Go to Chat</StyledLink>
    </PageContainer>
  );
};

export default PaymentSuccessPage;

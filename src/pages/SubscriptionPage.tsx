import React, { useState } from 'react';
import styled from 'styled-components';
import { useAuthSubscription } from '../context/AuthSubscriptionContext';
import { createCheckoutSession, createCustomerPortalSession } from '../services/stripeService';
import { useTranslation } from 'react-i18next';

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 20px;
  min-height: calc(100vh - 120px); // Adjust based on header/footer height
  background: linear-gradient(135deg, #0e1117, #1b212c);
  color: #e6edf3;
`;

const Title = styled.h1`
  color: var(--color-primary); // Use CSS variable
  font-family: 'Montserrat', sans-serif;
  font-weight: 300;
  font-size: 2.5rem;
  margin-bottom: 20px;
  text-align: center;
`;

const Subtitle = styled.p`
  font-size: 1.1rem;
  color: #c9d1d9;
  margin-bottom: 30px;
  max-width: 600px;
  text-align: center;
  line-height: 1.6;
`;

const OptionsContainer = styled.div`
  display: flex;
  justify-content: center;
  gap: 30px;
  margin-top: 30px;
  flex-wrap: wrap; // Allow wrapping on smaller screens
`;

const OptionCard = styled.div`
  background-color: rgba(45, 55, 72, 0.7); // Semi-transparent dark blue-gray
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 30px;
  width: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s ease, box-shadow 0.3s ease;

  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 8px 25px rgba(0, 109, 119, 0.3); // Teal glow on hover
  }
`;

const PlanName = styled.h2`
  font-size: 1.8rem;
  color: #FFD700; // Gold color for plan name
  margin-bottom: 15px;
  font-weight: 500;
`;

const Price = styled.p`
  font-size: 2rem;
  font-weight: bold;
  color: #e6edf3;
  margin-bottom: 10px;
`;

const PriceDetail = styled.p`
  font-size: 0.9rem;
  color: #8b949e;
  margin-bottom: 25px;
`;

const SavingsHighlight = styled.p`
  font-size: 0.9rem;
  color: #58a6ff; // Light blue for highlighting savings
  font-weight: bold;
  margin-bottom: 25px;
`;

const SelectButton = styled.button`
  background-color: var(--color-primary); // Teal
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 25px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s ease, transform 0.2s ease;
  width: 100%; // Make button take full width of card
  margin-top: auto; // Push button to bottom

  &:hover {
    background-color: var(--color-primary-dark); // Darker teal
    transform: scale(1.03);
  }

  &:disabled {
    background-color: #586069;
    cursor: not-allowed;
  }
`;

const ManageButton = styled(SelectButton)`
  background-color: #006D77; // Teal
  margin-top: 1rem; // Add some space above
  width: auto; // Allow button to size to content
  padding: 0.8rem 2rem;

  &:hover {
      background-color: #009ba7;
  }
`;

const StatusContainer = styled.div`
  background-color: rgba(45, 55, 72, 0.7);
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 30px 40px;
  margin-top: 30px;
  text-align: center;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
`;

const StatusText = styled.p`
  font-size: 1.2rem;
  color: #e6edf3;
  margin-bottom: 15px;
`;

const StatusHighlight = styled.span`
  color: #FFD700; // Gold
  font-weight: bold;
  text-transform: capitalize;
`;

const ManageInfo = styled.p`
  font-size: 0.9rem;
  color: #8b949e;
  margin-top: 20px;
`;

const LoadingSpinner = styled.div`
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top: 4px solid var(--color-primary);
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 50px auto;

  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const ErrorMessage = styled.p`
  color: #f85149; // Red color for errors
  margin-top: 20px;
  text-align: center;
`;

const SubscriptionPage: React.FC = () => {
  const { currentUser, stripeRole, loading: authLoading } = useAuthSubscription();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleCheckout = async (planIdentifier: 'monthly' | 'annual') => {
    if (!currentUser) {
      setError(t('subscriptionPage.errorNotLoggedIn'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const token = await currentUser.getIdToken();
      const { checkoutUrl, error: checkoutError } = await createCheckoutSession(token, planIdentifier);

      if (checkoutError) {
        throw new Error(checkoutError);
      }

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        throw new Error(t('subscriptionPage.errorCreatingSession'));
      }
    } catch (err) {
      console.error('Checkout Error:', err);
      setError(err instanceof Error ? err.message : t('subscriptionPage.errorUnknown'));
      setLoading(false);
    }
    // No need to setLoading(false) on success, as we redirect
  };

  const handleManageSubscription = async () => {
    setError(null);
    setLoading(true);
    if (!currentUser) {
      setError(t('subscriptionPage.errorNotLoggedIn'));
      setLoading(false);
      return;
    }

    try {
      const portalUrl = await createCustomerPortalSession();
      window.location.href = portalUrl; // Redirect to Stripe Customer Portal
    } catch (err: any) {
      console.error("Manage Subscription Error:", err);
      setError(err.message || 'Could not open the customer portal.'); // Provide specific error
      setLoading(false);
    }
    // No need to set loading to false if redirect happens
  };

  if (authLoading) {
    return <PageContainer><LoadingSpinner /></PageContainer>;
  }

  if (!currentUser) {
    return <PageContainer><ErrorMessage>{t('subscriptionPage.errorNotLoggedIn')}</ErrorMessage></PageContainer>;
  }

  return (
    <PageContainer>
      <Title>{t('subscriptionPage.title')}</Title>
      <Subtitle>
        {t('subscriptionPage.subtitle')}
      </Subtitle>

      {stripeRole === 'none' || !stripeRole ? (
        <>
         <Subtitle style={{ marginTop: '20px', color: '#8b949e' }}>
           {t('subscriptionPage.invitation')}
         </Subtitle>
          <OptionsContainer>
            {/* Monthly Option */}
            <OptionCard>
              <PlanName>{t('subscriptionPage.monthlyPlanName')}</PlanName>
              <Price>$111</Price>
              <PriceDetail>{t('subscriptionPage.perMonth')}</PriceDetail>
              <SelectButton onClick={() => handleCheckout('monthly')} disabled={loading}>
                {loading ? t('subscriptionPage.processing') : t('subscriptionPage.chooseMonthly')}
              </SelectButton>
            </OptionCard>

            {/* Annual Option */}
            <OptionCard>
              <PlanName>{t('subscriptionPage.annualPlanName')}</PlanName>
              <Price>$1111</Price>
              <PriceDetail>{t('subscriptionPage.perYear')}</PriceDetail>
              <SavingsHighlight>{t('subscriptionPage.annualSavings')}</SavingsHighlight> 
              <SelectButton onClick={() => handleCheckout('annual')} disabled={loading}>
                {loading ? t('subscriptionPage.processing') : t('subscriptionPage.chooseAnnual')}
              </SelectButton>
            </OptionCard>
          </OptionsContainer>
        </>
      ) : (
        <StatusContainer>
          <StatusText>
            {t('subscriptionPage.currentStatus')}
            <StatusHighlight>{stripeRole}</StatusHighlight>
          </StatusText>
          <ManageInfo>
             {t('subscriptionPage.manageInfo')}
          </ManageInfo>
          <ManageButton onClick={handleManageSubscription} disabled={loading}>
            Manage Contribution
          </ManageButton>
        </StatusContainer>
      )}

      {error && <ErrorMessage>{error}</ErrorMessage>}
      {loading && (stripeRole === 'none' || !stripeRole) && <LoadingSpinner style={{marginTop: '30px'}}/>}
    </PageContainer>
  );
};

export default SubscriptionPage;

import React, { useState, FormEvent } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext'; 
import { useTranslation } from 'react-i18next';

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  min-height: calc(100vh - 120px); 
  background: linear-gradient(135deg, #0e1117, #1b212c);
  color: #e6edf3;
`;

const FormContainer = styled.div`
  background-color: rgba(45, 55, 72, 0.7); 
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 40px;
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
`;

const Title = styled.h1`
  color: var(--color-primary); 
  font-family: 'Montserrat', sans-serif;
  font-weight: 300;
  font-size: 2rem; 
  margin-bottom: 30px;
  text-align: center;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 15px;
  margin-bottom: 20px;
  border-radius: 8px;
  border: 1px solid #30363d;
  background-color: #0d1117; 
  color: #e6edf3; 
  font-size: 1rem;
  box-sizing: border-box; 

  &::placeholder {
    color: #8b949e;
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(0, 109, 119, 0.3); 
  }
`;

const SubmitButton = styled.button`
  background-color: var(--color-primary); 
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 25px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s ease, transform 0.2s ease;
  width: 100%;

  &:hover {
    background-color: var(--color-primary-dark); 
    transform: scale(1.02);
  }

  &:disabled {
    background-color: #586069;
    cursor: not-allowed;
    opacity: 0.7;
  }
`;

const Message = styled.p`
  margin-top: 20px;
  text-align: center;
  font-size: 0.9rem;
  line-height: 1.4;
`;

const SuccessMessage = styled(Message)`
  color: #58a6ff; 
`;

const ErrorMessage = styled(Message)`
  color: #f85149; 
`;

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState<boolean>(false);
  const { sendSignInLinkToEmail, loading, error: authError } = useAuth();
  const { t } = useTranslation();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null); 
    setIsError(false);

    if (!email) {
      setMessage(t('loginPage.errorEmailRequired'));
      setIsError(true);
      return;
    }

    try {
      const actionCodeSettings = {
        url: `${window.location.origin}/login/callback`, 
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(email, actionCodeSettings);
      setMessage(t('loginPage.successLinkSent', { email }));
      setIsError(false);
    } catch (err: any) { 
      console.error("Login Error:", err);
      setMessage(err.message || t('loginPage.errorSendingLink'));
      setIsError(true);
    }
  };

  React.useEffect(() => {
      if (authError) {
          setMessage(authError);
          setIsError(true);
      }
  }, [authError]);

  return (
    <PageContainer>
      <FormContainer>
        <Title>{t('loginPage.title')}</Title>
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <Input
            type="email"
            placeholder={t('loginPage.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <SubmitButton type="submit" disabled={loading}>
            {loading ? t('loginPage.sending') : t('loginPage.buttonSendLink')}
          </SubmitButton>
        </form>
        {message && (
          isError ? (
            <ErrorMessage>{message}</ErrorMessage>
          ) : (
            <SuccessMessage>{message}</SuccessMessage>
          )
        )}
      </FormContainer>
    </PageContainer>
  );
};

export default LoginPage;

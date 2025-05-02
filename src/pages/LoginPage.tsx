import React, { useState, FormEvent } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext'; 
import { useTranslation } from 'react-i18next';

// Main container styling
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
  margin-bottom: 20px;
  text-align: center;
`;

const Subtitle = styled.p`
  color: #8b949e;
  text-align: center;
  margin-bottom: 25px;
  line-height: 1.5;
  font-size: 0.95rem;
`;

const LandingMessage = styled.div`
  text-align: center;
  margin-bottom: 30px;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px 15px;
  margin-bottom: 15px;
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

const Button = styled.button`
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

const PrimaryButton = styled(Button)`
  margin: 15px 0;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
  border-radius: 30px;
  padding: 15px 25px;
  font-size: 1.1rem;
  letter-spacing: 0.5px;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 7px 20px rgba(0, 0, 0, 0.4);
  }
  
  &:active {
    transform: translateY(1px);
  }
`;

const TextButton = styled.button`
  background: transparent;
  border: none;
  color: var(--color-primary);
  font-size: 0.95rem;
  cursor: pointer;
  margin-top: 20px;
  padding: 5px;
  text-decoration: underline;
  
  &:hover {
    color: var(--color-primary-dark);
  }
`;

const FooterText = styled.p`
  color: #8b949e;
  font-size: 0.85rem;
  margin-top: 25px;
  text-align: center;
`;

const InlineLink = styled.span`
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 500;
  text-decoration: underline;

  &:hover {
    color: var(--color-primary-dark);
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

const SuccessContainer = styled.div`
  background-color: rgba(38, 160, 138, 0.1);
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  text-align: center;
  width: 100%;
`;

const SuccessTitle = styled.h3`
  color: var(--color-primary);
  margin-bottom: 10px;
  font-weight: 500;
`;

// Enhanced Success Container
const VisualSuccessContainer = styled(SuccessContainer)`
  background: linear-gradient(135deg, #1af9c6 0%, #0a2e2b 100%);
  border: none;
  color: #0e1117;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  padding: 48px 32px 36px 32px;
  margin: 48px 0 0 0;
  max-width: 420px;
  font-size: 1.15rem;
`;
const Emoji = styled.div`
  font-size: 3rem;
  margin-bottom: 12px;
`;
const VisualSuccessTitle = styled(SuccessTitle)`
  font-size: 2rem;
  color: #0e1117;
  margin-bottom: 12px;
`;

// Define types of auth mode
type AuthMode = 'landing' | 'login' | 'register';

const LoginPage: React.FC = () => {
  // State
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<AuthMode>('landing');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isCodeVerified, setIsCodeVerified] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false); 
  const [registerLinkSent, setRegisterLinkSent] = useState(false); 
  
  // Hooks
  const { sendSignInLinkToEmail, loading, error: authError, currentUser } = useAuth();
  const { t } = useTranslation();

  // On mount, check if magic link was recently sent
  React.useEffect(() => {
    const persisted = localStorage.getItem('magicLinkSent');
    if (persisted) {
      try {
        const parsed = JSON.parse(persisted);
        if (parsed.magicLinkSent && parsed.email) {
          setMagicLinkSent(true);
          setEmail(parsed.email);
          setMessage(t('loginPage.successLinkSent', { email: parsed.email }));
        }
      } catch {}
    }

    // Also check for register link sent
    const registrationPersisted = localStorage.getItem('registerLinkSent');
    if (registrationPersisted) {
      try {
        const parsed = JSON.parse(registrationPersisted);
        if (parsed.registerLinkSent && parsed.email) {
          setRegisterLinkSent(true);
          setEmail(parsed.email);
          setIsCodeVerified(true); 
          setAuthMode('register'); 
          setMessage(`Verification link sent to ${parsed.email}. Check your inbox!`);
        }
      } catch {}
    }
  }, [t]);

  // Timer to auto-hide magic link message
  React.useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (magicLinkSent) {
      timer = setTimeout(() => {
        setMagicLinkSent(false);
        setEmail('');
        setMessage(null);
        localStorage.removeItem('magicLinkSent');
      }, 30000); 
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [magicLinkSent]);

  // Timer to auto-hide register link message
  React.useEffect(() => {
    let timer: NodeJS.Timeout | undefined;
    if (registerLinkSent) {
      timer = setTimeout(() => {
        setRegisterLinkSent(false);
        setEmail('');
        setMessage(null);
        setIsCodeVerified(false);
        localStorage.removeItem('registerLinkSent');
      }, 30000); 
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [registerLinkSent]);
  
  // Handle login submission (magic link)
  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null); 
    setIsError(false);
    setMagicLinkSent(false); 
    localStorage.removeItem('magicLinkSent');

    if (!email) {
      setMessage(t('loginPage.errorEmailRequired'));
      setIsError(true);
      return;
    }

    try {
      setMessage("Verifying account...");
      setIsError(false);
      
      const checkResponse = await fetch('/.netlify/functions/check-email-exists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      
      const checkData = await checkResponse.json();
      
      if (!checkResponse.ok) {
        throw new Error(checkData.error || 'Failed to verify email');
      }
      
      if (!checkData.exists) {
        setMessage("This email address is not registered. Please check your email or register with an invitation code.");
        setIsError(true);
        return;
      }
      
      // If email exists, proceed with sending magic link
      const actionCodeSettings = {
        url: `${window.location.origin}/login/callback`, 
        handleCodeInApp: true,
      };
      await sendSignInLinkToEmail(email, actionCodeSettings);
      setMessage(t('loginPage.successLinkSent', { email }));
      setIsError(false);
      setMagicLinkSent(true);
      // Persist to localStorage
      localStorage.setItem('magicLinkSent', JSON.stringify({ magicLinkSent: true, email }));
    } catch (err: any) { 
      console.error("Login Error:", err);
      setMessage(err.message || t('loginPage.errorSendingLink'));
      setIsError(true);
    }
  };

  // Handle registration code verification
  const handleVerifyCode = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setIsError(false);
    setIsVerifying(true);
    setIsCodeVerified(false);

    try {
      const response = await fetch('/.netlify/functions/verify-access-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, accessCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed.');
      }

      setMessage('Access code verified successfully!');
      setIsError(false);
      setIsCodeVerified(true);
    } catch (error: any) {
      console.error('Verification error:', error);
      setMessage(error.message || 'An error occurred during verification.');
      setIsError(true);
      setIsCodeVerified(false);
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle sending magic link after code verification
  const handleSendMagicLink = async () => {
    setMessage(null);
    setIsError(false);
    setRegisterLinkSent(false);

    const actionCodeSettings = {
      url: `${window.location.origin}/login/callback`,
      handleCodeInApp: true,
    };

    try {
      await sendSignInLinkToEmail(email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      setMessage(`Verification link sent to ${email}. Check your inbox!`);
      setIsError(false);
      setRegisterLinkSent(true);
      // Persist registration status
      localStorage.setItem('registerLinkSent', JSON.stringify({ registerLinkSent: true, email }));
    } catch (error: any) {
      console.error('Error sending magic link:', error);
      setMessage(error.message || 'Failed to send verification link.');
      setIsError(true);
    }
  };

  // Toggle between auth modes
  const switchToMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setMessage(null);
    setIsError(false);
    if (mode !== 'register') {
      setIsCodeVerified(false);
      setAccessCode('');
    }
    // Keep the email if switching modes for convenience
  };

  // Effect to handle auth context errors
  React.useEffect(() => {
    if (authError) {
      setMessage(authError);
      setIsError(true);
    }
  }, [authError]);

  // When user wants to send to a different email, clear localStorage and reset state
  const resetMagicLinkState = () => {
    setMagicLinkSent(false);
    setEmail('');
    setMessage(null);
    localStorage.removeItem('magicLinkSent');
  };

  // When user wants to try registration again
  const resetRegisterLinkState = () => {
    setRegisterLinkSent(false);
    setEmail('');
    setAccessCode('');
    setIsCodeVerified(false);
    setMessage(null);
    localStorage.removeItem('registerLinkSent');
  };
  
  return (
    <PageContainer>
      <FormContainer>
        <Title>{t('loginPage.title')}</Title>

        {/* Landing View - Default */}
        {authMode === 'landing' && !magicLinkSent && (
          <>
            <LandingMessage>
              <Subtitle>
                Luna is currently available by invitation only. 
                Access is limited to individuals who have been invited to participate in this planetary awakening.
              </Subtitle>
            </LandingMessage>
            
            <PrimaryButton onClick={() => switchToMode('login')}>
              I have an account
            </PrimaryButton>
            
            <FooterText>
              Have an invitation code? <InlineLink onClick={() => switchToMode('register')}>Click here</InlineLink>
            </FooterText>
          </>
        )}

        {/* Login View */}
        {authMode === 'login' && (
          <>
            {magicLinkSent ? (
              <VisualSuccessContainer>
                <Emoji>✉️</Emoji>
                <VisualSuccessTitle>Check your inbox!</VisualSuccessTitle>
                <p style={{ fontWeight: 500, fontSize: '1.1rem', margin: '20px 0 8px 0' }}>
                  Magic link sent to <span style={{ color: '#0e1117', background: '#fff', borderRadius: '6px', padding: '2px 10px', fontWeight: 700 }}>{email}</span>
                </p>
                <p style={{ marginBottom: 12 }}>Open your email and click the link to access Luna.</p>
                <p style={{ fontSize: '0.98rem', color: '#0e1117', opacity: 0.85 }}>
                  Didn’t receive it? Check your spam folder or try again.
                </p>
                <TextButton style={{ marginTop: 28, color: '#0e1117', fontWeight: 600 }} onClick={resetMagicLinkState}>
                  Send to a different email
                </TextButton>
              </VisualSuccessContainer>
            ) : (
              <>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleLoginSubmit(e);
                  }} 
                  style={{ width: '100%' }}
                  noValidate
                >
                  <Input
                    type="email"
                    placeholder={t('loginPage.emailPlaceholder')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                  />
                  <Button 
                    type="submit" 
                    disabled={loading}
                  >
                    {loading ? t('loginPage.sending') : t('loginPage.buttonSendLink')}
                  </Button>
                </form>
                {message && isError && (
                  <ErrorMessage>{message}</ErrorMessage>
                )}
                <TextButton onClick={() => switchToMode('landing')}>
                  Back
                </TextButton>
              </>
            )}
          </>
        )}

        {/* Register with Code View */}
        {authMode === 'register' && !isCodeVerified && !currentUser && (
          <>
            <Subtitle>
              Please enter your email and the invitation code you received.
            </Subtitle>
            <form onSubmit={handleVerifyCode} style={{ width: '100%' }}>
              <Input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="text"
                placeholder="Invitation Code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                required
              />
              <Button type="submit" disabled={isVerifying || !email || !accessCode}>
                {isVerifying ? 'Verifying...' : 'Verify Invitation Code'}
              </Button>
            </form>
            
            <TextButton onClick={() => switchToMode('landing')}>
              Back
            </TextButton>
          </>
        )}

        {/* After Code Verification */}
        {authMode === 'register' && isCodeVerified && !currentUser && (
          <>
            {registerLinkSent ? (
              <VisualSuccessContainer>
                <Emoji>✉️</Emoji>
                <VisualSuccessTitle>Welcome to Luna!</VisualSuccessTitle>
                <p style={{ fontWeight: 500, fontSize: '1.1rem', margin: '20px 0 8px 0' }}>
                  Magic link sent to <span style={{ color: '#0e1117', background: '#fff', borderRadius: '6px', padding: '2px 10px', fontWeight: 700 }}>{email}</span>
                </p>
                <p style={{ marginBottom: 12 }}>Open your email and click the link to access your new account.</p>
                <p style={{ fontSize: '0.98rem', color: '#0e1117', opacity: 0.85 }}>
                  Didn't receive it? Check your spam folder or try again.
                </p>
                <TextButton style={{ marginTop: 28, color: '#0e1117', fontWeight: 600 }} onClick={resetRegisterLinkState}>
                  Try again
                </TextButton>
              </VisualSuccessContainer>
            ) : (
              <>
                <Subtitle>
                  Your invitation code has been verified. You can now receive a magic link to access Luna.
                </Subtitle>
                <Button 
                  onClick={handleSendMagicLink} 
                  disabled={loading}
                  style={{ marginTop: '10px' }}
                >
                  {loading ? 'Sending Link...' : 'Send Magic Link Login'}
                </Button>
                
                <TextButton onClick={() => switchToMode('landing')}>
                  Back
                </TextButton>
              </>
            )}
          </>
        )}
        
        {/* Messages - Only show outside the login view AND when not logged in */}
        {authMode !== 'login' && !currentUser && message && (
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

import React, { useState } from 'react';
import { sendSignInLinkToEmail } from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Assuming firebaseConfig exports auth
import styled from 'styled-components';

// Basic styling (can be enhanced later)
const RegisterContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
`;

const RegisterForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 15px;
  padding: 30px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background-color: #f9f9f9; // Light background for the form
  width: 100%;
  max-width: 400px;
`;

const Input = styled.input`
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

const Button = styled.button`
  padding: 10px 15px;
  background-color: #007bff; // Example button color
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #0056b3;
  }

  &:disabled {
    background-color: #ccc;
    cursor: not-allowed;
  }
`;

const Message = styled.p`
  margin-top: 15px;
  color: ${props => (props.color === 'error' ? 'red' : 'green')};
`;

const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isCodeVerified, setIsCodeVerified] = useState(false);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
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

      setMessage({ text: data.message || 'Code verified successfully!', type: 'success' });
      setIsCodeVerified(true); // Enable magic link button

    } catch (error: any) {
      console.error('Verification error:', error);
      setMessage({ text: error.message || 'An error occurred during verification.', type: 'error' });
      setIsCodeVerified(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSendMagicLink = async () => {
    setMessage(null);
    setIsSendingLink(true);

    const actionCodeSettings = {
      // URL to redirect user back to after email link is clicked.
      // Use the URL of your deployed site or localhost for testing.
      // Ensure this domain is authorized in Firebase Console > Authentication > Settings > Authorized domains.
      url: window.location.origin + '/login/callback', // Example callback URL
      handleCodeInApp: true, // Must be true
    };

    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Save the email locally so you don't need to ask the user for it again
      // on the sign-in completion page.
      window.localStorage.setItem('emailForSignIn', email);
      setMessage({ text: `Verification link sent to ${email}. Check your inbox!`, type: 'success' });
    } catch (error: any) {
      console.error('Error sending magic link:', error);
      setMessage({ text: error.message || 'Failed to send verification link.', type: 'error' });
    } finally {
      setIsSendingLink(false);
    }
  };

  return (
    <RegisterContainer>
      <h2>Register for Luna Portal</h2>
      <RegisterForm onSubmit={handleVerifyCode}>
        <Input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isCodeVerified} // Disable email field after verification
        />
        <Input
          type="text"
          placeholder="Access Code"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value)}
          required
          disabled={isCodeVerified} // Disable code field after verification
        />
        {!isCodeVerified && (
          <Button type="submit" disabled={isVerifying || !email || !accessCode}>
            {isVerifying ? 'Verifying...' : 'Verify Access Code'}
          </Button>
        )}
      </RegisterForm>

      {isCodeVerified && (
        <Button onClick={handleSendMagicLink} disabled={isSendingLink} style={{ marginTop: '20px' }}>
          {isSendingLink ? 'Sending Link...' : 'Send Magic Link Login'}
        </Button>
      )}

      {message && <Message color={message.type}>{message.text}</Message>}

      {/* Add link to login page if needed */}
      {/* <p>Already registered? <Link to="/login">Login here</Link></p> */}
    </RegisterContainer>
  );
};

export default RegisterPage;

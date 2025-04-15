// src/pages/LoginCallbackPage.tsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebaseConfig'; // Assuming firebaseConfig exports auth
import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import styled from 'styled-components';

// Basic styling (can be enhanced later)
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
  background-color: #f8f9fa; // Light background for feedback
  color: #333; // Dark text
`;

const Message = styled.p`
  font-size: 1.2rem;
  margin-bottom: 1rem;
`;

const ErrorMessage = styled.p`
  font-size: 1rem;
  color: #dc3545; /* Standard error color */
`;

const LoginCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Verifying your login link...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processSignIn = async () => {
      const currentUrl = window.location.href;

      // 1. Check if the link is a valid sign-in link
      if (isSignInWithEmailLink(auth, currentUrl)) {
        // 2. Get the email from localStorage (set before sending the link)
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
          // If email is not in localStorage, handle error
          console.error("Email for sign-in not found in localStorage.");
          setError('Verification failed: Email not found. Please return to the registration page and try sending the link again.');
          setMessage(''); // Clear initial message
          // Optionally redirect after delay
          setTimeout(() => navigate('/register'), 5000);
          return; // Stop processing if email is missing
        }

        try {
          // 3. Sign in the user with the email and the link
          setMessage('Completing sign-in...');
          await signInWithEmailLink(auth, email, currentUrl);

          // 4. Clean up: Remove the email from localStorage
          window.localStorage.removeItem('emailForSignIn');

          // 5. Redirect to the main app page on success
          setMessage('Sign-in successful! Redirecting to the portal...');
          // Redirect after a short delay to allow the user to see the message
          setTimeout(() => {
            navigate('/chat'); // Redirect to the chat page
          }, 1500);

        } catch (err: any) {
          console.error('Error signing in with email link:', err);
          setError(`Sign-in failed: ${err.message}. Please try again or request a new link.`);
          setMessage(''); // Clear processing message
        }
      } else {
        console.error('Invalid sign-in link detected.');
        setError('This link is invalid or has expired. Please request a new login link from the registration page.');
        setMessage(''); // Clear initial message
        // Redirect to registration page after a delay
        setTimeout(() => {
            navigate('/register');
        }, 3000);
      }
    };

    processSignIn();
  }, [navigate]); // Dependency array includes navigate

  return (
    <Container>
      {message && <Message>{message}</Message>}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {/* You could add a loading spinner here */}
    </Container>
  );
};

export default LoginCallbackPage;

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import styled, { ThemeProvider } from 'styled-components';
import { theme } from './styles/theme';
import { GlobalStyle } from './styles/GlobalStyle';
import { AuthSubscriptionProvider, useAuthSubscription } from './context/AuthSubscriptionContext';

// Lazy load pages
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage')); 
const ChatPage = React.lazy(() => import('./pages/ChatPage'));
const SubscriptionPage = React.lazy(() => import('./pages/SubscriptionPage'));
const LoginCallbackPage = React.lazy(() => import('./pages/LoginCallbackPage')); 
const PaymentSuccessPage = React.lazy(() => import('./pages/PaymentSuccessPage')); 

// Basic styled layout container
const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`;

const Header = styled.header`
  background-color: #333; 
  color: white;
  padding: 1rem 2rem;

  nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: 1rem;
  }

  nav a {
    color: white;
    text-decoration: none;
    &:hover {
      text-decoration: underline;
    }
  }
`;

const MainContent = styled.main`
  flex-grow: 1;
  padding: 1rem; 
`;

const Footer = styled.footer`
  background-color: #333; 
  color: #ccc;
  text-align: center;
  padding: 1rem;
  margin-top: auto; 
`;

const AppContent: React.FC = () => {
  const { currentUser, stripeRole, loading } = useAuthSubscription();

  if (loading) {
    return <div>Loading Luna Core...</div>;
  }

  return (
    <ThemeProvider theme={theme}> 
      <GlobalStyle />
      <Router>
        <Suspense fallback={<div>Loading Page...</div>}> 
          <AppContainer>
            <Header>
              <nav>
                <ul>
                  {currentUser && <li><Link to="/chat">Chat</Link></li>}
                  {currentUser && <li><Link to="/subscription">Donate</Link></li>}
                  {!currentUser && <li><Link to="/login">Login</Link></li>}
                  {!currentUser && <li><Link to="/register">Register</Link></li>}
                </ul>
              </nav>
            </Header>

            <MainContent>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={!currentUser ? <LoginPage /> : (stripeRole === 'monthly' || stripeRole === 'annual' ? <Navigate to="/chat" replace /> : <Navigate to="/subscribe" replace />)} />
                <Route path="/register" element={!currentUser ? <RegisterPage /> : (stripeRole === 'monthly' || stripeRole === 'annual' ? <Navigate to="/chat" replace /> : <Navigate to="/subscribe" replace />)} />
                <Route path="/login/callback" element={<LoginCallbackPage />} />

                {/* Protected Routes - require login */}
                <Route path="/subscription" element={currentUser ? <SubscriptionPage /> : <Navigate to="/login" />} /> 
                <Route path="/payment-success" element={currentUser ? <PaymentSuccessPage /> : <Navigate to="/login" />} />
                
                {/* Protected Route - requires login AND active subscription */}
                <Route
                  path="/chat"
                  element={
                    currentUser && (stripeRole === 'monthly' || stripeRole === 'annual') ? (
                      <ChatPage />
                    ) : (
                      // If logged in but no valid role, redirect to subscribe, else to login
                      currentUser ? <Navigate to="/subscribe" replace /> : <Navigate to="/login" replace />
                    )
                  }
                />

                <Route
                  path="*"
                  element={
                    currentUser ? (
                      (stripeRole === 'monthly' || stripeRole === 'annual') ? <Navigate to="/chat" replace /> : <Navigate to="/subscribe" replace />
                    ) : (
                      <Navigate to="/login" replace /> // Default redirect for non-logged-in users is login
                    )
                  }
                />
              </Routes>
            </MainContent>

            <Footer>
              &copy; {new Date().getFullYear()} Astrorganism Foundation. Connecting with Luna.
            </Footer>
          </AppContainer>
        </Suspense>
      </Router>
    </ThemeProvider>
  );
};

// Wrap the main content with the Provider
const App: React.FC = () => {
  return (
    <AuthSubscriptionProvider>
      <AppContent />
    </AuthSubscriptionProvider>
  );
};

export default App;

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import styled, { ThemeProvider } from 'styled-components';
import { theme } from './styles/theme';
import { GlobalStyle } from './styles/GlobalStyle';
import { AuthSubscriptionProvider, useAuthSubscription } from './context/AuthSubscriptionContext';
import { useAuth } from './context/AuthContext';

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
  background-color: #161b22; 
  color: #e6edf3;
  padding: 0.8rem 2rem;
  display: flex;
  justify-content: space-between; 
  align-items: center;
  border-bottom: 1px solid #30363d;

  nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: 1.5rem; 
    align-items: center;
  }

  nav a,
  nav button { 
    color: #c9d1d9; 
    text-decoration: none;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
    font-size: 0.95rem;
    transition: color 0.2s ease;

    &:hover {
      color: #58a6ff; 
    }
  }

  nav button {
    // Specific button styles if needed, e.g., slight padding
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
  const { currentUser, loading: authLoading, logout } = useAuth();
  const { stripeRole, loading: subLoading } = useAuthSubscription();

  const loading = authLoading || subLoading;

  const handleLogout = async () => {
    try {
      await logout();
      console.log('Logout successful');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

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
                  {currentUser && (
                    <li>
                      <button onClick={handleLogout}>Logout</button>
                    </li>
                  )}
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
                      <Navigate to="/login" replace /> 
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

const App: React.FC = () => {
  return (
    <AuthSubscriptionProvider>
      <AppContent />
    </AuthSubscriptionProvider>
  );
};

export default App;

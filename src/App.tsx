import React, { Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from './context/AuthContext';

// Lazy load pages for better performance
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const RegisterPage = React.lazy(() => import('./pages/RegisterPage')); // Import RegisterPage
const ChatPage = React.lazy(() => import('./pages/ChatPage'));
const SubscriptionPage = React.lazy(() => import('./pages/SubscriptionPage'));
const LoginCallbackPage = React.lazy(() => import('./pages/LoginCallbackPage')); // Import LoginCallbackPage

// Basic styled layout container
const AppContainer = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  padding: ${({ theme }) => theme.spacing.medium};
  background-color: ${({ theme }) => theme.colors.secondary};
  color: #fff;

  nav ul {
    list-style: none;
    padding: 0;
    display: flex;
    gap: ${({ theme }) => theme.spacing.medium};
  }

  nav a {
    color: #fff;
    font-weight: bold;
    &:hover {
      color: ${({ theme }) => theme.colors.accent};
    }
  }
`;

const MainContent = styled.main`
  flex-grow: 1;
  padding: ${({ theme }) => theme.spacing.large};
`;

const Footer = styled.footer`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.medium};
  margin-top: auto; // Push footer to the bottom
  font-size: 0.9em;
  color: ${({ theme }) => theme.colors.text}99; // Slightly faded text
`;

// Simple loading fallback
const LoadingFallback = () => <div>Loading...</div>; // Replace with a nicer loading component later

function App() {
  const { currentUser, loading } = useAuth();

  // Show loading indicator while checking auth state
  if (loading) {
    return <LoadingFallback />; 
  }

  return (
    <Router>
      <AppContainer>
        <Header>
          <nav>
            <ul>
              <li><Link to="/">Home (Chat)</Link></li>
              <li><Link to="/login">Login</Link></li>
              <li><Link to="/register">Register</Link></li>
              <li><Link to="/subscription">Subscription</Link></li>
              {/* Add Language Toggle Here */}
            </ul>
          </nav>
        </Header>

        <MainContent>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              {/* Redirect root based on auth state */}
              <Route path="/" element={currentUser ? <Navigate to="/chat" /> : <Navigate to="/register" />} />
              
              {/* Public Routes (accessible when not logged in) */}
              <Route path="/login" element={!currentUser ? <LoginPage /> : <Navigate to="/chat" />} />
              <Route path="/register" element={!currentUser ? <RegisterPage /> : <Navigate to="/chat" />} /> 
              <Route path="/login/callback" element={<LoginCallbackPage />} /> {/* Add route for callback */}

              {/* Protected Routes (require login) */}
              <Route path="/subscription" element={currentUser ? <SubscriptionPage /> : <Navigate to="/login" />} />
              <Route path="/chat" element={currentUser ? <ChatPage /> : <Navigate to="/login" />} /> 
              
              {/* Add a 404 Not Found route? */}
              {/* <Route path="*" element={<NotFoundPage />} /> */}
            </Routes>
          </Suspense>
        </MainContent>

        <Footer>
          &copy; {new Date().getFullYear()} Astrorganism Foundation. Connecting with Luna.
        </Footer>
      </AppContainer>
    </Router>
  );
}

export default App;

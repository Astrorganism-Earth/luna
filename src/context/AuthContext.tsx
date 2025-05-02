// src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  sendSignInLinkToEmail as firebaseSendSignInLinkToEmail, // Rename to avoid conflict
  signOut as firebaseSignOut, // Rename to avoid conflict
  ActionCodeSettings
} from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Import your Firebase auth instance

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  error: string | null; // Add error state
  sendSignInLinkToEmail: (email: string, actionCodeSettings: ActionCodeSettings) => Promise<void>;
  logout: () => Promise<void>;
  // Add register function later if needed
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Initial auth state loading
  const [authOperationLoading, setAuthOperationLoading] = useState(false); // For specific operations like sending link
  const [error, setError] = useState<string | null>(null); // For auth operation errors

  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      console.log('AuthProvider: Auth state changed, user:', user ? user.uid : null);
      setCurrentUser(user);
      setLoading(false); // Initial check complete
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // --- Send Sign In Link --- 
  const sendSignInLinkToEmail = useCallback(async (email: string, actionCodeSettings: ActionCodeSettings) => {
    setAuthOperationLoading(true);
    setError(null);
    console.log(`AuthProvider: Attempting to send sign-in link to ${email}`);
    try {
      await firebaseSendSignInLinkToEmail(auth, email, actionCodeSettings);
      // Store the email locally to use upon callback verification
      window.localStorage.setItem('emailForSignIn', email);
      console.log(`AuthProvider: Sign-in link sent successfully to ${email}`);
    } catch (err: any) {
      console.error('AuthProvider: Error sending sign-in link:', err);
      setError(err.message || 'Failed to send sign-in link.');
      throw err; // Re-throw error so the caller component can handle it too
    } finally {
      setAuthOperationLoading(false);
    }
  }, []);

  // --- Logout --- 
  const logout = useCallback(async () => {
    setAuthOperationLoading(true);
    setError(null);
    console.log('AuthProvider: Attempting to sign out...');
    try {
      await firebaseSignOut(auth);
      setCurrentUser(null); // Explicitly set user to null
      console.log('AuthProvider: Signed out successfully.');
    } catch (err: any) {
      console.error('AuthProvider: Error signing out:', err);
      setError(err.message || 'Failed to sign out.');
      throw err; // Re-throw error
    } finally {
      setAuthOperationLoading(false);
    }
  }, []);

  const value = {
    currentUser,
    loading: loading || authOperationLoading, // Combine initial loading with operation loading
    error,
    sendSignInLinkToEmail,
    logout,
    // Expose register function here later
  };

  // Render children immediately, loading state is handled by consumer or within value
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

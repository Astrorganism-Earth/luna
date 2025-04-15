import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { onIdTokenChanged, User } from 'firebase/auth';
import { auth } from '../firebaseConfig';

interface AuthSubscriptionContextType {
  currentUser: User | null;
  stripeRole: string | null | undefined;
  loading: boolean;
}

// Create the context with a default value
const AuthSubscriptionContext = createContext<AuthSubscriptionContextType | undefined>(undefined);

// Create a provider component
export const AuthSubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [stripeRole, setStripeRole] = useState<string | null | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const idTokenResult = await user.getIdTokenResult(true); // Force refresh
          const role = idTokenResult.claims.stripeRole as string | undefined;
          console.log('AuthSubscriptionContext: User logged in, Role:', role);
          setStripeRole(role || null);
          setLoading(false);
        } catch (error) {
          console.error("Error fetching token claims:", error);
          setStripeRole(null);
          setLoading(false);
        }
      } else {
        console.log('AuthSubscriptionContext: User logged out or not found');
        setStripeRole(null);
        setLoading(false);
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  // Prepare the value for the context provider
  const value = {
    currentUser,
    stripeRole,
    loading,
  };

  // Provide the context value to children components
  return (
    <AuthSubscriptionContext.Provider value={value}>
      {children} {/* Always render children; consumer handles loading UI */}
    </AuthSubscriptionContext.Provider>
  );
};

// Create a custom hook to use the auth context
export const useAuthSubscription = () => {
  const context = useContext(AuthSubscriptionContext);
  if (context === undefined) {
    throw new Error('useAuthSubscription must be used within an AuthSubscriptionProvider');
  }
  return context;
};

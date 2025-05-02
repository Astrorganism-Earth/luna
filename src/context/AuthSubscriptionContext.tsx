import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { onIdTokenChanged, User } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

// Define energy constants
const MONTHLY_ENERGY_GRANT = 11111;
const ANNUAL_ENERGY_GRANT = 111111;
const DEFAULT_ENERGY = 0; // Initial balance for non-subscribers

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
      if (user) {
        let fetchedRole: string | null = null;
        let fetchFailed = false; // Flag to track if token fetch fails

        // --- Step 1: Fetch ID Token Claims to get Stripe Role ---
        try {
          const idTokenResult = await user.getIdTokenResult(true); // Force refresh
          fetchedRole = (idTokenResult.claims.stripeRole as string | undefined) || null;
          console.log('AuthSubscriptionContext: Fetched Role:', fetchedRole);
          // Only update state if fetched role is different from the current state
          // This prevents unnecessary re-renders if the role hasn't changed
          if (fetchedRole !== stripeRole) {
            setStripeRole(fetchedRole);
          }
        } catch (error) {
          console.error("AuthSubscriptionContext: Error fetching token claims:", error);
          fetchFailed = true; // Set flag on error
          // --- CHANGE: DO NOT set role to null on error --- 
          // Keep the existing stripeRole state value if token fetch fails.
          // fetchedRole will retain its initial value (the current stripeRole state)
          // but the global state shouldn't change just because of a temporary error.
          // We will still use the value of 'fetchedRole' (which might be the old role, or null if error happened before first success)
          // specifically for the document *creation* logic in Step 2 if needed.
        }

        // --- Step 2: Get or Create Firestore User Document ---
        const userDocRef = doc(db, "users", user.uid);
        try {
          const docSnap = await getDoc(userDocRef);

          if (!docSnap.exists()) {
            console.log(`AuthSubscriptionContext: No user document found for ${user.uid}. Creating one...`);
            // Determine initial energy based on fetched role (or null if fetch failed)
            // Use the role we *attempted* to fetch for initial setup.
            // Use null for role if fetch failed, otherwise use the fetchedRole
            const roleForDocCreation = fetchFailed ? null : fetchedRole;

            let initialEnergy = DEFAULT_ENERGY; 
            if (roleForDocCreation === 'monthly') { 
              initialEnergy = MONTHLY_ENERGY_GRANT;
            } else if (roleForDocCreation === 'annual') { 
              initialEnergy = ANNUAL_ENERGY_GRANT;
            }

            // Create the document with role-based initial energy
            await setDoc(userDocRef, {
              email: user.email || '',
              energyBalance: initialEnergy, // Use calculated initial energy
              stripeRole: roleForDocCreation, // Store the role used for creation
              createdAt: Timestamp.now()
            });
            console.log(`AuthSubscriptionContext: User document created for ${user.uid} with role ${roleForDocCreation} and energy ${initialEnergy}`);
          } else {
            // Optional: Could add logic here to update existing doc's stripeRole if needed
            // This might be where we ensure the Firestore doc's role matches the latest fetchedRole
          }
        } catch (firestoreError) {
          console.error(`AuthSubscriptionContext: Error accessing/creating user document for ${user.uid}:`, firestoreError);
        }

        // --- Step 3: Finalize Loading State ---
        setCurrentUser(user);
        setLoading(false);
      } else {
        // --- Handle User Logout ---
        console.log('AuthSubscriptionContext: User logged out or not found');
        setCurrentUser(null);
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

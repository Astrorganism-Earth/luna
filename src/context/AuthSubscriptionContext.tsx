import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import { onIdTokenChanged, User } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc, Timestamp, onSnapshot, DocumentData } from 'firebase/firestore';

// Define energy constants
const MONTHLY_ENERGY_GRANT = 11111;
const ANNUAL_ENERGY_GRANT = 111111;
const DEFAULT_ENERGY = 0; // Initial balance for non-subscribers

interface FirestoreUserData extends DocumentData {
  email?: string;
  energyPoints?: number; 
  stripeRole?: string | null;
  subscriptionStatus?: string | null;
  createdAt?: Timestamp;
  lastUpdated?: Timestamp;
}

interface AuthSubscriptionContextType {
  currentUser: User | null;
  stripeRole: string | null | undefined; 
  firestoreUserData: FirestoreUserData | null; 
  loading: boolean;
}

// Create the context with a default value
const AuthSubscriptionContext = createContext<AuthSubscriptionContextType | undefined>(undefined);

// Create a provider component
export const AuthSubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [stripeRole, setStripeRole] = useState<string | null | undefined>(undefined); 
  const [firestoreUserData, setFirestoreUserData] = useState<FirestoreUserData | null>(null); 
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    setLoading(true);
    const unsubscribeIdToken = onIdTokenChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user); 
        let fetchedRole: string | null = null;

        try {
          const idTokenResult = await user.getIdTokenResult(true); 
          fetchedRole = (idTokenResult.claims.stripeRole as string | undefined) || null;
          console.log('AuthSubscriptionContext: Fetched Role from claims:', fetchedRole);
          if (fetchedRole !== stripeRole) { 
            setStripeRole(fetchedRole);
          }
        } catch (error) {
          console.error("AuthSubscriptionContext: Error fetching token claims:", error);
        }

        const userDocRef = doc(db, "users", user.uid);
        const unsubscribeSnapshot = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            console.log('AuthSubscriptionContext: Firestore document updated:', docSnap.data());
            setFirestoreUserData(docSnap.data() as FirestoreUserData);
          } else {
            console.log(`AuthSubscriptionContext: No user document for ${user.uid}. Creating one...`);
            const roleForDocCreation = fetchedRole; 

            let initialEnergy = DEFAULT_ENERGY;
            if (roleForDocCreation === 'monthly') {
              initialEnergy = MONTHLY_ENERGY_GRANT;
            } else if (roleForDocCreation === 'annual') {
              initialEnergy = ANNUAL_ENERGY_GRANT;
            }

            const newUserDocData = {
              email: user.email || '',
              energyPoints: initialEnergy, 
              stripeRole: roleForDocCreation,
              subscriptionStatus: roleForDocCreation ? 'active' : 'inactive', 
              createdAt: Timestamp.now(),
              lastUpdated: Timestamp.now(),
            };

            setDoc(userDocRef, newUserDocData)
              .then(() => console.log(`AuthSubscriptionContext: User document created for ${user.uid} with role ${roleForDocCreation} and energy ${initialEnergy}`))
              .catch(e => console.error("AuthSubscriptionContext: Error creating user document:", e));
          }
        }, (error) => {
          console.error("AuthSubscriptionContext: Firestore snapshot error:", error);
          setFirestoreUserData(null); 
        });

        setLoading(false); 

        return () => {
          console.log('AuthSubscriptionContext: Unsubscribing Firestore snapshot listener for UID:', user.uid);
          unsubscribeSnapshot();
        };

      } else {
        console.log('AuthSubscriptionContext: User logged out or not found');
        setCurrentUser(null);
        setStripeRole(null);
        setFirestoreUserData(null);
        setLoading(false);
      }
    });

    return () => {
      console.log('AuthSubscriptionContext: Unsubscribing ID token listener.');
      unsubscribeIdToken();
    };
  }, [stripeRole]) 

  const value = {
    currentUser,
    stripeRole, 
    firestoreUserData, 
    loading,
  };

  return (
    <AuthSubscriptionContext.Provider value={value}>
      {children}
    </AuthSubscriptionContext.Provider>
  );
};

export const useAuthSubscription = () => {
  const context = useContext(AuthSubscriptionContext);
  if (context === undefined) {
    throw new Error('useAuthSubscription must be used within an AuthSubscriptionProvider');
  }
  return context;
};

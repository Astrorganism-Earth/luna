import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
    getFirestore,
    collection,
    query,
    orderBy,
    getDocs,
    Timestamp,
    DocumentData,
    CollectionReference,
    Query,
    doc,
    onSnapshot
} from "firebase/firestore";
// import { getAnalytics } from "firebase/analytics"; // Optional: Add if you plan to use Firebase Analytics

// Load Firebase config from environment variables (Vite specific)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID // Optional
};

// Validate essential config (optional but recommended)
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error("Firebase config missing in environment variables (VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID)");
    // Handle the error appropriately, maybe throw or show a message
}

// Initialize Firebase App (prevent duplicates)
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  console.log("Firebase initialized.");
} else {
  app = getApp(); // Get the default app if already initialized
  console.log("Firebase already initialized.");
}

const auth = getAuth(app);
const db = getFirestore(app);
// const analytics = getAnalytics(app); // Optional

// Define the expected structure of a chat document from Firestore
export interface FirestoreChatMessage { // Exporting for potential use elsewhere
    id: string; // Firestore document ID
    role: 'user' | 'assistant'; // Roles stored in Firestore
    content: string;
    timestamp: Timestamp;
    // Add other fields if they exist, e.g., tokenCost, energyCost
    tokenCost?: { input: number; output: number; total: number };
    usdCost?: number;
    energyCost?: number;
}

// Define the expected structure of a user document from Firestore
export interface UserData {
    // Add other fields that might exist on the user document
    email?: string;
    displayName?: string;
    energyBalance?: number;
    // ... any other fields like subscription status, etc.
}

/**
 * Fetches the chat history for a given user from Firestore.
 * @param userId The ID of the user whose chat history to fetch.
 * @returns A Promise resolving to an array of FirestoreChatMessage objects, ordered by timestamp.
 * @throws Throws an error if fetching fails.
 */
export const getChatHistory = async (userId: string): Promise<FirestoreChatMessage[]> => {
    if (!userId) {
        console.error("getChatHistory Error: No userId provided.");
        throw new Error("User ID is required to fetch chat history.");
    }

    try {
        const chatHistoryRef: CollectionReference<DocumentData> = collection(db, 'users', userId, 'chatHistory');
        const q: Query<DocumentData> = query(chatHistoryRef, orderBy('timestamp', 'asc'));
        const querySnapshot = await getDocs(q);

        const history: FirestoreChatMessage[] = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Basic validation to ensure essential fields exist
            if (data.role && data.content && data.timestamp instanceof Timestamp) {
                 history.push({
                    id: doc.id,
                    role: data.role as 'user' | 'assistant',
                    content: data.content as string,
                    timestamp: data.timestamp,
                    // Optionally include other fields if they exist
                    tokenCost: data.tokenCost,
                    usdCost: data.usdCost,
                    energyCost: data.energyCost,
                });
            } else {
                console.warn(`Skipping invalid chat history document: ${doc.id}`, data);
            }
        });

        console.log(`Fetched ${history.length} chat history messages for user ${userId}`);
        return history;
    } catch (error) {
        console.error(`Error fetching chat history for user ${userId}:`, error);
        throw new Error('Failed to fetch chat history.'); // Re-throw a generic error
    }
};

/**
 * Sets up a real-time listener for a user's document in Firestore.
 *
 * @param userId The ID of the user whose data to listen to.
 * @param callback A function to be called with the UserData whenever the document changes.
 * @returns An unsubscribe function to stop the listener.
 */
export const onUserDataUpdate = (userId: string, callback: (data: UserData | null) => void) => {
    if (!userId) {
        console.error("onUserDataUpdate Error: No userId provided.");
        // Immediately call callback with null and return a no-op unsubscribe
        callback(null);
        return () => {};
    }

    const userDocRef = doc(db, 'users', userId);

    const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            const data = docSnapshot.data() as UserData;
            console.log("User data updated:", data);
            callback(data);
        } else {
            console.warn(`User document ${userId} does not exist.`);
            callback(null); // Document doesn't exist or was deleted
        }
    }, (error) => {
        console.error(`Error listening to user data for ${userId}:`, error);
        callback(null); // Pass null on error
        // Optionally, handle specific errors differently
    });

    // Return the unsubscribe function provided by onSnapshot
    return unsubscribe;
};

export { app, auth, db /*, analytics */ };

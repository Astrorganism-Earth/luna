// netlify/functions/chat-gemini.ts
import type { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';
import admin from 'firebase-admin';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, GenerationConfig, Content, Part } from '@google/generative-ai';
import { INITIAL_CONVERSATION_PRELOAD } from './conversationData';

// --- Firebase Admin Initialization ---
// Use direct environment variables as required by Netlify and user preference
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
// The private key should be the raw string including -----BEGIN... and -----END...
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY; 

if (!firebaseProjectId || !firebaseClientEmail || !firebasePrivateKey) {
    console.error('Chat Function Error: Missing Firebase env vars (PROJECT_ID, CLIENT_EMAIL, PRIVATE_KEY).');
} else if (!admin.apps.length) {
    try {
        admin.initializeApp({
            // Pass the direct values to admin.credential.cert
            credential: admin.credential.cert({
                projectId: firebaseProjectId,
                clientEmail: firebaseClientEmail,
                privateKey: firebasePrivateKey, // Use the raw key directly
            }),
        });
        console.log("Firebase Admin initialized successfully.");
    } catch (error) { 
        console.error("Chat Function: Firebase Admin init error:", error);
        // Potentially return an error response here if init fails critically
    }
}
const db = admin.firestore();

// --- Google Generative AI Initialization ---
const geminiApiKey = process.env.GOOGLE_API_KEY;
if (!geminiApiKey) console.error('Chat Function Error: Missing GOOGLE_API_KEY.');
const genAI = new GoogleGenerativeAI(geminiApiKey || '');
// Read model name from env var, fallback to flash
const geminiModelName = process.env.GEMINI_MODEL_NAME || 'gemini-1.5-flash-latest';
console.log(`Chat Function: Using Gemini Model: ${geminiModelName}`); // Log which model is being used

// --- Constants ---
const ENERGY_COST_MULTIPLIER = 250;
const GEMINI_PRICING = { FLASH: { PROMPT_UNDER_200K_USD: 1.25, PROMPT_OVER_200K_USD: 2.50, OUTPUT_UNDER_200K_USD: 10.00, OUTPUT_OVER_200K_USD: 15.00, THRESHOLD_TOKENS: 200000 } };

// --- Safety Settings for Gemini ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Generation Configuration ---
const generationConfig: GenerationConfig = { maxOutputTokens: 8192 };

// --- Helper Function ---
function calculateGeminiCost(inputTokens: number, outputTokens: number, pricingTier: typeof GEMINI_PRICING.FLASH): number {
    const isLargePrompt = inputTokens > pricingTier.THRESHOLD_TOKENS;
    const inputPrice = isLargePrompt ? pricingTier.PROMPT_OVER_200K_USD : pricingTier.PROMPT_UNDER_200K_USD;
    const outputPrice = isLargePrompt ? pricingTier.OUTPUT_OVER_200K_USD : pricingTier.OUTPUT_UNDER_200K_USD;
    return ((inputTokens / 1_000_000) * inputPrice) + ((outputTokens / 1_000_000) * outputPrice);
}

// --- Netlify Handler ---
export const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
    // 1. Authentication and User ID Verification
    const { authorization } = event.headers;
    let userId: string | null = null;

    if (!authorization || !authorization.startsWith('Bearer ')) {
        console.warn('Chat Function: Missing or invalid Authorization header.');
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized', details: 'Missing or invalid authentication token.' }) };
    }

    const idToken = authorization.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        userId = decodedToken.uid;
        console.log(`Chat Function: User authenticated: ${userId}`);
    } catch (error: any) {
        console.error(`Chat Function: Firebase token verification failed: ${error.message}`);
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden', details: 'Invalid or expired authentication token.' }) };
    }

    // Ensure userId was successfully obtained
    if (!userId) {
         console.error('Chat Function: Could not determine userId after token verification attempt.');
        return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error', details: 'Failed to process user identity.' }) };
    }

    // 2. Parse Request Body (only message needed now)
    let userMessageContent: string | null = null;
    try {
        const body = JSON.parse(event.body || '{}');
        userMessageContent = body.message;
        if (!userMessageContent) {
            throw new Error('Missing message content in request body.');
        }
    } catch (error: any) { // Catch JSON parsing errors or missing message
        console.error(`Chat Function: Error parsing request body or missing message for user ${userId}: ${error.message}`);
        return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request', details: `Invalid request body: ${error.message}` }) };
    }

    console.log(`Processing chat for user ${userId}`);

    // --- Save User Message Immediately ---
    const chatCollectionRef = db.collection('users').doc(userId).collection('chatHistory');
    try {
        await chatCollectionRef.add({
            role: 'user',
            content: userMessageContent, // Use the validated content
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`User message saved for ${userId} before Gemini call.`);
    } catch (error) {
        console.error(`Chat Function: Failed to save user message for ${userId}:`, error);
        // Return an error as we couldn't even save the input
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error', details: 'Failed to save user message to history.' })
        };
    }

    // --- Fetch User Document (needed for balance check) ---
    const userDocRef = db.collection('users').doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
        console.error(`Chat Function: User document ${userId} not found.`);
        return { statusCode: 404, body: JSON.stringify({ error: 'User not found', details: 'User profile does not exist.' }) };
    }

    const currentEnergyPoints = userDoc.data()?.energyPoints ?? 0;
    console.log(`User ${userId} current energy points: ${currentEnergyPoints}`);

    // 4. Prepare History for Gemini API (Now includes the just-saved user message)
    const historySnapshot = await chatCollectionRef.orderBy('timestamp', 'asc').get();
    const history: Content[] = historySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
            // Map Firestore role ('user'/'assistant') to Gemini role ('user'/'model')
            role: data.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: data.content }]
        };
    });

    // *** Combine initial preload and fetched history (which now includes the latest user msg) ***
    const apiHistory: Content[] = [
        ...INITIAL_CONVERSATION_PRELOAD, // Add the initial context first
        ...history                     // Add the stored history (includes latest user msg)
    ];

    // 5. Estimate Token Count & Check Balance (using combined history)
    const modelForCounting = genAI.getGenerativeModel({ model: geminiModelName });
    let estimatedInputTokens = 0;
    try {
      const { totalTokens } = await modelForCounting.countTokens({ contents: apiHistory });
      estimatedInputTokens = totalTokens;
      console.log(`Estimated input tokens (including preload & history): ${estimatedInputTokens}`);
    } catch (tokenError: any) {
      console.error(`Chat Function: Error counting tokens for user ${userId}:`, tokenError);
      // Decide if we should proceed without estimate or return error
      // For now, let's proceed but log the error
      estimatedInputTokens = 0; // Or maybe use a fallback estimate?
    }

    // Calculate *estimated* cost based on estimated input tokens (output tokens are 0 for pre-check)
    const maxOutputTokensEstimate = generationConfig.maxOutputTokens ?? 2048; // Use config or fallback
    const maxPotentialInputCostUsd = (estimatedInputTokens / 1_000_000) * GEMINI_PRICING.FLASH.PROMPT_UNDER_200K_USD;
    const maxPotentialOutputCostUsd = (maxOutputTokensEstimate / 1_000_000) * GEMINI_PRICING.FLASH.OUTPUT_UNDER_200K_USD;
    const maxPotentialTotalCostUsd = maxPotentialInputCostUsd + maxPotentialOutputCostUsd;
    // Ceiling to ensure we charge whole energy points and cover potential fractions
    const maxPotentialEnergyCost = Math.ceil(maxPotentialTotalCostUsd * ENERGY_COST_MULTIPLIER);

    console.log(`Max potential cost - USD: ${maxPotentialTotalCostUsd.toFixed(6)}, Energy: ${maxPotentialEnergyCost}`);
    console.log(`User current energy points: ${currentEnergyPoints}`);

    // Check if potential cost exceeds balance
    if (maxPotentialEnergyCost > currentEnergyPoints) {
        console.warn(`User ${userId} has insufficient energy points. Current: ${currentEnergyPoints}, Estimated Cost: ${maxPotentialEnergyCost}`);
        return {
            statusCode: 402, // Payment Required
            body: JSON.stringify({
                error: 'Insufficient energy balance.',
                details: `Your current energy points (${currentEnergyPoints}) is less than the estimated cost (${maxPotentialEnergyCost}) for this message. Please recharge.`,
                currentBalance: currentEnergyPoints,
                estimatedCost: maxPotentialEnergyCost
            })
        };
    }
    console.log("User has sufficient balance. Proceeding with API call.");

    // Initialize the actual model for the chat call
    const model = genAI.getGenerativeModel({
        model: geminiModelName,
        safetySettings,
        generationConfig
    });

    // Start chat - send history *before* the current user message
    const chatHistoryForChatStart: Content[] = [
         ...INITIAL_CONVERSATION_PRELOAD,
         ...history.slice(0, -1) // Exclude the latest user message
    ];
    const chat = model.startChat({ history: chatHistoryForChatStart });

    console.log("Sending message to Gemini...");
    const result = await chat.sendMessage(userMessageContent); // Send only the new user message

    // --- Cost Calculation based on ACTUAL usage ---
    const response = result.response;
    const geminiResponseText = response.text();
    const usageMetadata = response.usageMetadata;
    let inputTokens = 0, outputTokens = 0, totalTokens = 0;

    if (usageMetadata) {
        inputTokens = usageMetadata.promptTokenCount;
        outputTokens = usageMetadata.candidatesTokenCount;
        totalTokens = usageMetadata.totalTokenCount;
        console.log(`Actual usage - Input Tokens: ${inputTokens}, Output Tokens: ${outputTokens}, Total Tokens: ${totalTokens}`);
        // Optional Sanity Check
        if (inputTokens !== estimatedInputTokens) {
             console.warn(`Actual input tokens (${inputTokens}) differ from pre-calculated (${estimatedInputTokens}). Using actual value for cost.`);
        }
    } else {
        console.warn("Usage metadata not available in response. Using pre-calculated input and estimated output for cost.");
        inputTokens = estimatedInputTokens; // Use pre-calculated input
        outputTokens = maxOutputTokensEstimate; // Use estimated max output as fallback
        totalTokens = inputTokens + outputTokens;
    }

    // Calculate actual cost based on usage metadata (or fallback)
    const costUsd = (inputTokens / 1_000_000) * GEMINI_PRICING.FLASH.PROMPT_UNDER_200K_USD +
                    (outputTokens / 1_000_000) * GEMINI_PRICING.FLASH.OUTPUT_UNDER_200K_USD;
    const energyCost = Math.ceil(costUsd * ENERGY_COST_MULTIPLIER); // Ceiling for actual cost too

    console.log(`Actual cost - USD: ${costUsd.toFixed(6)}, Energy: ${energyCost}`);

    // Deduct cost and update balance
    const newEnergyPoints = currentEnergyPoints - energyCost;
    console.log(`Updating user ${userId} points: ${currentEnergyPoints} -> ${newEnergyPoints}`);

    // Final check for negative balance after actual cost calculation
    if (newEnergyPoints < 0) {
        console.error(`User ${userId} points went negative (${newEnergyPoints}) unexpectedly after API call. Cost: ${energyCost}, Start Balance: ${currentEnergyPoints}. Aborting Firestore update.`);
        // Return an error instead of committing a negative balance
         return {
            statusCode: 500, // Internal Server Error due to calculation discrepancy
            body: JSON.stringify({
                error: 'Internal error: Balance calculation resulted in negative value.',
                details: `Could not complete request due to balance calculation error. Current Balance: ${currentEnergyPoints}. Cost: ${energyCost}. Please contact support.`,
                // Optionally return Luna's generated text but indicate the state wasn't saved
                reply: geminiResponseText, // Send reply, but warn user state wasn't saved
                state_saved: false
            })
        };
    }

    // Firestore Batch Update (Only Assistant Msg + Balance)
    const batch = db.batch();
    const newAssistantMessageRef = chatCollectionRef.doc();
    batch.set(newAssistantMessageRef, {
        role: 'assistant',
        content: geminiResponseText,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        tokenCost: { input: inputTokens, output: outputTokens, total: totalTokens },
        usdCost: costUsd,
        energyCost: energyCost // Store the actual calculated energy cost
    });

    batch.update(userDocRef, { energyPoints: newEnergyPoints }); // Update with the final, positive balance
    await batch.commit();
    console.log(`User ${userId} energy points updated to ${newEnergyPoints}. Batch committed.`);

    // Return success response
    return {
        statusCode: 200,
        body: JSON.stringify({
            reply: geminiResponseText,
            updatedEnergyPoints: newEnergyPoints,
            usage: {
                inputTokens,
                outputTokens,
                totalTokens,
                costUsd,
                energyCost
            }
        })
    };
};

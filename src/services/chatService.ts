// src/services/chatService.ts
import axios from 'axios';

// Define expected response structure from the Netlify function
interface LunaResponse {
    reply: string;
    updatedEnergyBalance?: number; // Optional, as we might not always send it back
    usage?: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUsd: number;
        energyCost: number;
    };
    error?: string; // Include error field for explicit error handling
    details?: string;
}

/**
 * Sends a message to the Luna backend chat function.
 * @param message The user's message text.
 * @param idToken The Firebase Auth ID token for the logged-in user.
 * @returns A Promise resolving to the LunaResponse object.
 * @throws Throws an error if the API call fails or returns an unexpected status.
 */
export const sendMessageToLuna = async (message: string, idToken: string): Promise<LunaResponse> => {
    // Basic validation
    if (!message) {
        return Promise.reject(new Error("Message cannot be empty."));
    }
    if (!idToken) {
        return Promise.reject(new Error("Authentication token is required."));
    }

    const chatApiEndpoint = '/.netlify/functions/chat-gemini';

    try {
        console.log('Sending message to Luna backend:', { message }); // Avoid logging token
        const response = await axios.post<LunaResponse>(
            chatApiEndpoint,
            { message: message }, // Request body
            {
                headers: {
                    'Authorization': `Bearer ${idToken}`, // Pass token in header
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Received response from Luna backend:', response.data);

        // Axios throws for non-2xx status codes, but we can double-check
        if (response.status >= 200 && response.status < 300) {
            // Check if the body itself indicates an error (e.g., from safety filters or insufficient balance)
            if (response.data.error) {
                console.warn(`Chat Service Warning: Backend returned an error: ${response.data.error}`);
                // We might still want to return the data for the UI to handle
                // Or throw a specific error based on response.data.error
            }
            return response.data;
        } else {
            // This part might be redundant if Axios always throws for non-2xx
            console.error(`Chat Service Error: Received non-success status code ${response.status}`);
            throw new Error(`Request failed with status code ${response.status}`);
        }
    } catch (error: any) {
        console.error('Chat Service Error: Failed to send message:', error);

        // Handle Axios specific errors
        if (axios.isAxiosError(error) && error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
            // Return the error structure from the backend if available
            if (error.response.data && (error.response.data.error || error.response.data.details)) {
                return {
                    reply: '', // No reply on error
                    error: error.response.data.error || 'Unknown backend error',
                    details: error.response.data.details,
                };
            }
            throw new Error(`Backend request failed with status ${error.response.status}: ${error.response.data?.error || error.message}`);
        } else if (axios.isAxiosError(error) && error.request) {
            // The request was made but no response was received
            console.error('Error request:', error.request);
            throw new Error('No response received from server.');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error message:', error.message);
            throw new Error(`Failed to send message: ${error.message}`);
        }
        // Rethrow or return a specific error structure
        // throw error; // Default rethrow
    }
};

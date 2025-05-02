// netlify/functions/check-email-exists.ts
import type { Handler, HandlerEvent } from '@netlify/functions';
import { auth } from '../firebaseAdmin';

interface RequestBody {
  email: string;
}

export const handler: Handler = async (event: HandlerEvent) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  // Parse request body
  let email: string;
  try {
    const body = JSON.parse(event.body || '{}') as RequestBody;
    email = body.email;

    if (!email) {
      throw new Error('Email is required');
    }
  } catch (error: any) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Invalid request',
        details: error.message,
      }),
    };
  }

  try {
    // Try to get the user by email
    const userRecord = await auth.getUserByEmail(email)
      .then(user => ({ exists: true, user }))
      .catch(error => {
        if (error.code === 'auth/user-not-found') {
          return { exists: false, user: null };
        }
        throw error; // Re-throw other errors
      });

    // Return the result
    return {
      statusCode: 200,
      body: JSON.stringify({
        exists: userRecord.exists,
        // Don't include sensitive user data in the response
      }),
    };
  } catch (error: any) {
    console.error(`Error checking email existence: ${error.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Server error',
        details: 'An error occurred while checking if the email exists',
      }),
    };
  }
};

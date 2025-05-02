# Luna Project TODO List

## Core Functionality

*   [ ] **Subscription:**
    *   [X] Detect subscription status (active/inactive, monthly/annual).
    *   [X] Display subscription status clearly to the user.
    *   [X] Implement Stripe Checkout initiation for recurring plans (Monthly $111, Annual $1111).
    *   [X] Link Stripe Customer to Firebase User.
    *   [X] Implement Stripe Webhook handler (`checkout.session.completed`, `customer.subscription.updated/deleted`, etc.) - *File exists, needs full implementation.*
    *   [ ] Update Firebase Custom Claims (`stripeRole`) based on webhook events.
    *   [ ] Ensure `AuthSubscriptionContext` reflects updated custom claims.
    *   [ ] Implement complete subscription management (update/cancel).
    *   [ ] Refine webhook handling for real-time updates.
*   [ ] **Authentication:**
    *   [X] Elegant registration form requiring email and access code.
    *   [X] Call Netlify function to verify access codes.
    *   [X] Seamless login system with magic link via Firebase Auth.
    *   [X] Secure session management (handled by Firebase Auth SDK).
    *   [ ] Implement secure database/method for storing/validating access codes (Dev placeholder likely needed).
    *   [ ] Implement JWT session management (if not already done).
*   [ ] **Conversation Interface:**
    *   [X] Build the chat UI - *Basic structure likely exists in ChatPage.tsx.*
    *   [ ] Implement message flow animation.
    *   [ ] Add rich text/HTML support.
    *   [ ] Ensure mobile/desktop responsiveness.
    *   [ ] Integrate dyslexia-friendly font.
    *   [ ] Add 'thinking' animation.
*   [ ] **Conversation Management:**
    *   [ ] Initialize conversations with the hidden 'awakened state' JSON.
    *   [ ] Implement conversation persistence.
    *   [ ] Add options to start new/continue/name/organize conversations.
*   [ ] **EI Integration:**
    *   [ ] Integrate Claude API.
    *   [X] Integrate Gemini API - *`chat-gemini.ts` function exists, implementation ongoing.*
    *   [ ] Build abstraction layer for multiple EIs.
    *   [ ] Implement token management.
    *   [ ] Add fallback mechanisms.
    *   [ ] Handle long response times gracefully (loading indicators, retry button).
*   [ ] **Internationalization:**
    *   [X] Ensure all UI elements/messages are translatable - *i18n setup exists.*
    *   [ ] Add language toggle.
*   [ ] **Admin Panel:**
    *   [ ] Create admin dashboard route (long HASH URL).
    *   [ ] Implement access code management.
    *   [ ] Implement user management.

## Design Elements

*   [ ] Implement visual identity (colors, sacred geometry, animations).
*   [ ] Implement custom cursor.
*   [ ] Implement typography (Montserrat Light, futuristic fonts).
*   [ ] Ensure full responsiveness.
*   [ ] Add smooth page transitions.
*   [ ] Add haptic feedback (mobile).
*   [ ] Implement dark/light mode toggle (default dark).

## Technical Requirements

*   [X] Choose and implement state management (Redux/Context) - *Context API chosen.*
*   [X] Set up Netlify Functions for backend logic (partially done).
*   [X] Integrate Firebase for authentication and database (Auth setup done, DB interaction needed).
*   [X] Implement secure API key management using environment variables (Standard Netlify practice).
*   [ ] Add rate limiting.
*   [ ] Implement security measures (HTTPS, XSS/CSRF protection, input sanitization, data encryption).
*   [ ] Implement performance optimizations (code splitting, asset optimization, lazy loading).
*   [ ] Set up comprehensive logging.

## Gemini Persistent Chat & Energy Balance

*   [ ] **Backend (Netlify Function - `chat-gemini.ts`):**
    *   [X] Create new Netlify function `chat-gemini.ts` - *File exists.*
    *   [ ] Securely fetch user ID/context within the function.
    *   [ ] Set up Firebase Admin SDK initialization (using env vars like other functions).
    *   [ ] Implement logic to retrieve user's chat history from Firestore (`users/{userId}/chatHistory`).
    *   [ ] Implement logic to retrieve user's `energyBalance` from Firestore (`users/{userId}`).
    *   [ ] Load the secret `initialConversation` constant.
    *   [ ] Prepend `initialConversation` to the retrieved history + new user message for the API call.
    *   [ ] Integrate with Google Gemini API (using `google-generativeai` SDK). Use Gemini Flash model.
    *   [X] Securely manage Gemini API Key using environment variables - *Standard Netlify practice.*
    *   [ ] Implement token counting for input (preload + history + user msg) and output (Gemini response).
    *   [ ] Define Gemini Flash pricing constants (Input: $1.25/$2.50 per 1M tokens; Output: $10.00/$15.00 per 1M tokens, based on prompt size <=/> 200k).
    *   [ ] Calculate USD cost per API call based on token counts and pricing tiers.
    *   [ ] Define energy cost multiplier (250).
    *   [ ] Calculate energy cost (USD cost * 250).
    *   [ ] Check if user `energyBalance` is sufficient before API call / decrement. Return error if insufficient.
    *   [ ] Decrement calculated energy cost from user's `energyBalance` in Firestore.
    *   [ ] Append user message and Gemini response to Firestore chat history (`users/{userId}/chatHistory`).
    *   [ ] Return Gemini response (and optionally updated energy balance) to the frontend.
    *   [ ] Implement error handling for API calls and Firestore operations.
*   [ ] **Frontend (`ChatPage.tsx`, `services/chatService.ts`):**
    *   [X] Create a new service function (`chatService.ts`) to call the `chat-gemini` Netlify function - *File exists.*
    *   [ ] Modify `ChatPage.tsx` to fetch and display chat history from Firestore on load (excluding secret preload).
    *   [ ] Implement input field and send button logic to call the chat service function.
    *   [ ] Display streaming or complete responses from Gemini.
    *   [ ] Implement loading indicators while waiting for response.
    *   [ ] Optionally display the user's remaining `energyBalance`.
    *   [ ] Handle and display errors (e.g., "Insufficient Energy Balance").
    *   [ ] Ensure UI updates correctly after sending/receiving messages.
*   [ ] **Firestore Structure:**
    *   [ ] Finalize user document structure in `users` collection (e.g., add `energyBalance`, `subscriptionTier`, `subscriptionRenewalDate`).
    *   [ ] Define structure for `chatHistory` subcollection documents (e.g., `role`, `content`, `timestamp`, `tokenCost`, `energyCost`).
*   [ ] **Subscription Integration (`stripe-webhook-handler.ts`):**
    *   [ ] Modify webhook handler for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`.
    *   [ ] On successful subscription creation/renewal, determine tier (monthly/annual).
    *   [ ] Reset/update user's `energyBalance` in Firestore (11111 for monthly, 111111 for annual).
    *   [ ] Store relevant subscription details (tier, renewal/end date) in user document.
*   [ ] **Constants:**
    *   [X] Add `initialConversation.ts` content (ensure it's not bundled/exposed client-side if possible, ideally loaded server-side) - *File exists.*
    *   [ ] Add Gemini pricing tiers and energy multiplier constants.
    *   [ ] Add base energy balance constants (11111, 111111).
*   [ ] **Security:**
    *   [ ] Ensure the `initialConversation` preload is handled securely server-side and never sent to the client.
    *   [ ] Validate user authentication/authorization in the Netlify function.

## Cleanup/Refinement

*   [ ] Review and remove unused files (e.g., potentially `counter.js`, `main.js`, `javascript.svg` if not used).
*   [ ] Refine styling (`style.css` vs styled-components).
*   [ ] Review/refactor existing code for clarity and best practices.

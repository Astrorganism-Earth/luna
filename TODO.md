# Luna Project TODO List

## Core Functionality

*   [ ] **Subscription:**
    *   [X] Detect subscription status (active/inactive, monthly/annual).
    *   [X] Display subscription status clearly to the user.
    *   [X] Implement Stripe Checkout initiation for recurring plans (Monthly $111, Annual $1111).
    *   [X] Link Stripe Customer to Firebase User.
    *   [ ] Implement Stripe Webhook handler (`checkout.session.completed`, `customer.subscription.updated/deleted`, etc.).
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
    *   [ ] Build the chat UI.
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
    *   [ ] Integrate Gemini API.
    *   [ ] Build abstraction layer for multiple EIs.
    *   [ ] Implement token management.
    *   [ ] Add fallback mechanisms.
    *   [ ] Handle long response times gracefully (loading indicators, retry button).
*   [ ] **Internationalization:**
    *   [ ] Ensure all UI elements/messages are translatable.
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

*   [ ] Choose and implement state management (Redux/Context).
*   [X] Set up Netlify Functions for backend logic (partially done with `verify-access-code` and `create-checkout-session`).
*   [X] Integrate Firebase for authentication and database (Auth setup done, DB interaction for codes needed).
*   [X] Implement secure API key management using environment variables (Done for Firebase/Stripe in existing functions).
*   [ ] Integrate Firebase/Stripe extension (Using direct API calls + webhooks instead, seems fine).
*   [ ] Add rate limiting.
*   [ ] Implement security measures (HTTPS, XSS/CSRF protection, input sanitization, data encryption).
*   [ ] Implement performance optimizations (code splitting, asset optimization, lazy loading).
*   [ ] Set up comprehensive logging.

## Cleanup/Refinement

*   [ ] Review and remove unused files (e.g., potentially `counter.js`, `main.js`, `javascript.svg` if not used).
*   [ ] Refine styling (`style.css` vs styled-components).
*   [ ] Review/refactor existing code for clarity and best practices.

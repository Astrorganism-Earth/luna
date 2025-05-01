# Luna Project Structure Documentation

This document provides an overview of the directory structure and the purpose of key files within the Luna project (`Astrorganism-Earth/luna`).

## Root Directory

-   `index.html`: The main HTML entry point for the single-page React application. Vite injects the bundled JavaScript here.
-   `package.json`: Defines project metadata, dependencies (React, Vite, Firebase, Stripe, etc.), and scripts (like `dev`, `build`).
-   `package-lock.json`: Records the exact versions of dependencies installed, ensuring reproducible builds.
-   `vite.config.ts`: Configuration file for the Vite build tool, defining build options, plugins, and development server settings.
-   `tsconfig.json`: Main TypeScript configuration for the frontend application.
-   `tsconfig.node.json`: TypeScript configuration specifically for Node.js environments, likely used by Vite's config and potentially Netlify functions during build/dev.
-   `TODO.md`: Contains a list of development tasks, features to implement, or bugs to fix.
-   `.gitignore`: Specifies intentionally untracked files that Git should ignore (e.g., `node_modules`, `dist`, `.env`). *(Assumed presence)*
-   `netlify.toml`: Configuration file for Netlify deployment settings, build commands, and function directories. *(Assumed presence, standard for Netlify projects)*

## `netlify/functions/`

This directory contains serverless functions deployed on Netlify. They handle backend logic, sensitive operations, and communication with external services like Stripe and Firebase (for secure operations like access code verification).

-   `verify-access-code.ts`: Handles the verification of user-provided access codes during registration against a secure source.
-   `create-checkout-session.ts`: Creates a Stripe Checkout session when a user initiates a subscription/donation.
-   `stripe-webhook-handler.ts`: Listens for and processes incoming webhook events from Stripe (e.g., payment success, subscription updates) to keep application state consistent.
-   `create-customer-portal-session.ts`: Creates a session for the Stripe Customer Portal, allowing users to manage their subscriptions.
-   `utils/stripeUtils.ts`: Contains shared utility functions used by the Stripe-related serverless functions.
-   `stripe-webhook.ts`: *Potentially an older version or helper for `stripe-webhook-handler.ts`. Needs review.*

## `src/`

The core source code of the React frontend application.

### Main Entrypoints & Configuration

-   `main.tsx`: The main entry point for the React application. It renders the root `App` component into the DOM (`index.html`).
-   `App.tsx`: The root React component. It sets up routing (`react-router-dom`), global layout, context providers (`AuthContext`, `AuthSubscriptionContext`), and manages application-wide state or logic.
-   `firebaseConfig.ts`: Contains the Firebase project configuration details (API keys, auth domain, etc.) needed to initialize and connect to Firebase services.
-   `i18n.ts`: Initializes and configures the `i18next` library for internationalization (i18n), setting up language detection, fallback languages, and loading translations.
-   `vite-env.d.ts`: TypeScript declaration file for Vite-specific environment variables (e.g., `import.meta.env`).

### `constants/`

-   `initialConversation.ts`: Defines the default "awakened state" conversation history provided to the EI API at the start of a new chat session.

### `context/`

Contains React Context providers for managing global state.

-   `AuthContext.tsx`: Provides authentication state (e.g., current user, loading status) and functions (login, logout, register) throughout the application.
-   `AuthSubscriptionContext.tsx`: Provides user subscription status, likely integrating with `AuthContext` to make subscription data easily accessible alongside user data.

### `locales/`

Contains translation files for internationalization.

-   `en/translation.json`: JSON file with English language strings.
-   `es/translation.json`: JSON file with Spanish language strings.

### `pages/`

Contains components representing distinct pages or views in the application, typically mapped to routes.

-   `LoginPage.tsx`: Component for the user login form/magic link initiation.
-   `RegisterPage.tsx`: Component for the user registration form, including access code input.
-   `LoginCallbackPage.tsx`: Handles the authentication callback, likely after a user clicks a magic link, verifying the token and logging the user in.
-   `ChatPage.tsx`: The main chat interface where users interact with Luna (the EI).
-   `SubscriptionPage.tsx`: Displays subscription options and allows users to initiate the donation/subscription process via Stripe.
-   `PaymentSuccessPage.tsx`: Page shown to the user after a successful Stripe Checkout payment.

### `services/`

Contains modules for interacting with external APIs or backend services.

-   `firebase.ts`: Functions for interacting with Firebase services (e.g., Authentication, Firestore database operations).
-   `stripeService.ts`: Client-side functions for interacting with the backend Stripe Netlify functions (e.g., initiating checkout, fetching subscription status).

### `styles/`

Contains styling-related files.

-   `GlobalStyle.ts`: Defines global CSS styles using `styled-components` (or similar), applied to the entire application (e.g., resets, base typography, background).
-   `theme.ts`: Defines the application's theme object (colors, fonts, spacing, breakpoints) used by `styled-components`.

### Potentially Unused/Example Files

*(These might be remnants from the initial project setup (e.g., Vite template) and may not be actively used. Review and remove if confirmed.)*

-   `src/counter.js`
-   `src/main.js`
-   `src/style.css`

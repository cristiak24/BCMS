# BCMS Web Client

BCMS is now a web-first React application. The production client is built with Vite and React Router into the static `dist` folder used by Firebase Hosting.

## Local development

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the web app

   ```bash
   npm run web
   ```

3. Build the production web app

   ```bash
   npm run build:web
   ```

The build includes PWA metadata and a lightweight service worker from `public/`.

## Migration direction

The Expo product runtime has been removed from the web client. Existing screens still use compatibility imports such as `react-native` and `expo-router`, but Vite aliases those imports to local browser adapters in `src/web/`; they are no longer provided by Expo, Metro, or React Native Web.

Next cleanup steps should replace the compatibility layer screen-by-screen with plain DOM components where it improves maintainability.

Expo Go is no longer part of the client workflow. Production work should be verified through `npm run build:web`.

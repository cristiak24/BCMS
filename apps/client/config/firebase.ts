import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { Platform } from '@/src/web/reactNative';
import Constants from '@/src/web/constants';
import { getClientEnv } from './env';
import { getPublicAppUrl } from './serverUrl';

const firebaseEnv = {
  EXPO_PUBLIC_FIREBASE_API_KEY: getClientEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: getClientEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: getClientEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: getClientEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: getClientEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  EXPO_PUBLIC_FIREBASE_APP_ID: getClientEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
};

function requireEnv(name: keyof typeof firebaseEnv) {
  const value = firebaseEnv[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateApiKey(apiKey: string | undefined) {
  if (!apiKey || !apiKey.startsWith('AIza')) {
    throw new Error(
      'Invalid Firebase apiKey. Recheck EXPO_PUBLIC_FIREBASE_API_KEY in apps/client/.env.local and restart the web dev server.',
    );
  }
}

const firebaseConfig = {
  apiKey: requireEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requireEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
};

validateApiKey(firebaseConfig.apiKey);

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firebase Auth only — no Firestore on the client
export const firebaseAuth =
  Platform.OS === 'web'
    ? getAuth(firebaseApp)
    : (() => {
        try {
          return initializeAuth(firebaseApp);
        } catch {
          return getAuth(firebaseApp);
        }
      })();

function extractExpoHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost ||
    (Constants.manifest2 as { extra?: { expoClient?: { hostUri?: string } } } | null)?.extra
      ?.expoClient?.hostUri;

  if (!hostUri) {
    return null;
  }

  return hostUri.replace(/^[a-z]+:\/\//i, '').split('/')[0]?.split(':')[0] ?? null;
}

export function buildInviteSignupUrl(inviteToken: string) {
  const query = `inviteToken=${encodeURIComponent(inviteToken)}`;

  if (Platform.OS === 'web') {
    return `${getPublicAppUrl()}/signup?${query}`;
  }

  const expoHost = extractExpoHost() || 'localhost';
  const port = getClientEnv('EXPO_PUBLIC_WEB_PORT') || '8081';
  return `http://${expoHost}:${port}/signup?${query}`;
}

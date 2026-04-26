import * as admin from 'firebase-admin';
import { loadServerEnv } from './loadEnv';

loadServerEnv();

function initAdminApp() {
  if (admin.apps.length) {
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const projectId =
    process.env.FIREBASE_PROJECT_ID?.trim() ||
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    'bcms-61b00';

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: (serviceAccount as any).project_id || projectId,
    });
    return;
  }

  // No service account — init with projectId only.
  // Token verification works without a service account because Firebase Admin
  // verifies tokens using Google's public JWKS endpoint (no ADC needed).
  admin.initializeApp({ projectId });
}

initAdminApp();

export { admin };

// Export only what we need — do NOT init Firestore (we use Postgres)
export const firebaseAuth = admin.auth();

export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'object' &&
    value &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

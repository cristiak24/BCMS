import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { loadServerEnv } from './loadEnv';

loadServerEnv();

function initAdminApp() {
  if (admin.apps.length) {
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID is required.');
  }

  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: (serviceAccount as any).project_id || projectId,
    });
    return;
  }

  if (clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
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

// Firestore is still used by a number of legacy routes/controllers.
export const firestore: Firestore = admin.firestore();
export const firebaseAuth = admin.auth();

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (
    typeof value === 'object' &&
    value &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export function toIso(value: unknown): string | null {
  return toDate(value)?.toISOString() ?? null;
}

export async function fetchDocById<T extends Record<string, unknown>>(collectionName: string, id: string) {
  const snap = await firestore.collection(collectionName).doc(String(id)).get();
  if (!snap.exists) {
    return null;
  }

  const data = snap.data() as Partial<T> & { id?: number | string };
  return {
    ...data,
    id: data.id ?? snap.id,
  } as unknown as T;
}

export async function fetchDocByNumericId<T extends Record<string, unknown>>(collectionName: string, id: number) {
  const snap = await firestore.collection(collectionName).where('id', '==', id).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) {
    return null;
  }

  const data = doc.data() as Partial<T> & { id?: number | string };
  return {
    ...data,
    id: typeof data.id === 'number' ? data.id : Number(data.id) || id,
  } as unknown as T;
}

export async function nextNumericId(counterName: string) {
  const counterRef = firestore.collection('__counters__').doc(counterName);

  const nextValue = await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists ? Number((snap.data() as { value?: number }).value ?? 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next, updatedAt: new Date() }, { merge: true });
    return next;
  });

  return nextValue;
}

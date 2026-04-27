/**
 * seed-superadmin.ts
 *
 * Idempotent script that creates the superadmin account:
 *   Email: test@test.com
 *   Password: testtest
 *   Role: superadmin
 *   Status: active
 *
 * Usage:
 *   cd apps/server && npx tsx scripts/seed-superadmin.ts
 *
 * Credentials needed (pick one):
 *   A) FIREBASE_SERVICE_ACCOUNT_JSON env var (JSON string of the service account key)
 *   B) GOOGLE_APPLICATION_CREDENTIALS env var pointing to the JSON file
 *   C) EXPO_PUBLIC_FIREBASE_API_KEY — uses Firebase REST API as fallback (local dev)
 *
 * Safe to run multiple times.
 */

import path from 'path';
import * as dotenv from 'dotenv';

// Load env vars — __dirname is apps/server/scripts when run with tsx
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
// Also load client env for EXPO_PUBLIC_FIREBASE_API_KEY fallback
dotenv.config({ path: path.resolve(__dirname, '../../client/.env.local') });

import * as admin from 'firebase-admin';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import * as schema from '../src/db/schema';

const { users } = schema;

// ────────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────────

const SUPERADMIN_EMAIL = 'test@test.com';
const SUPERADMIN_PASSWORD = 'testtest';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'bcms-61b00';
const FIREBASE_API_KEY = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌  DATABASE_URL is not set. Check apps/server/.env.local');
    process.exit(1);
}

// ────────────────────────────────────────────────────────────────────────────────
// Firebase helpers
// ────────────────────────────────────────────────────────────────────────────────

/** Try to init Firebase Admin SDK. Returns false if no credentials are available. */
function tryInitFirebaseAdmin(): boolean {
    if (admin.apps.length) return true;

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (serviceAccountJson) {
        const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: (serviceAccount as any).project_id || FIREBASE_PROJECT_ID,
        });
        return true;
    }

    // Try Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({ projectId: FIREBASE_PROJECT_ID });
        return true;
    }

    return false;
}

/** Get Firebase UID using Admin SDK */
async function getUidViaAdminSdk(): Promise<string> {
    const authAdmin = admin.auth();
    try {
        const existing = await authAdmin.getUserByEmail(SUPERADMIN_EMAIL);
        console.log(`✅  Firebase Auth user already exists: ${existing.uid}`);
        return existing.uid;
    } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
            const newUser = await authAdmin.createUser({
                email: SUPERADMIN_EMAIL,
                password: SUPERADMIN_PASSWORD,
                emailVerified: true,
                displayName: 'Superadmin',
            });
            console.log(`✅  Firebase Auth user created: ${newUser.uid}`);
            return newUser.uid;
        }
        throw err;
    }
}

/** Get Firebase UID via Identity Toolkit REST API (no service account needed) */
async function getUidViaRestApi(): Promise<string> {
    if (!FIREBASE_API_KEY) {
        throw new Error(
            'No Firebase credentials found.\n' +
            'Set FIREBASE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS, or EXPO_PUBLIC_FIREBASE_API_KEY.',
        );
    }

    const base = `https://identitytoolkit.googleapis.com/v1`;

    // Try sign-in first (user may already exist)
    const signInRes = await fetch(`${base}/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD, returnSecureToken: true }),
    });

    if (signInRes.ok) {
        const data = await signInRes.json() as { localId: string };
        console.log(`✅  Firebase Auth user already exists (REST): ${data.localId}`);
        return data.localId;
    }

    // If sign-in failed, create the user
    const signUpRes = await fetch(`${base}/accounts:signUp?key=${FIREBASE_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: SUPERADMIN_EMAIL, password: SUPERADMIN_PASSWORD, returnSecureToken: true }),
    });

    const signUpData = await signUpRes.json() as { localId?: string; error?: { message: string } };
    if (!signUpRes.ok) {
        throw new Error(`Firebase signup failed: ${signUpData.error?.message}`);
    }

    console.log(`✅  Firebase Auth user created (REST): ${signUpData.localId}`);
    return signUpData.localId!;
}

// ────────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────────

async function seed() {
    console.log('🌱  Seeding superadmin account...\n');

    // Step 1: Get Firebase UID
    let firebaseUid: string;

    const hasAdminSdk = tryInitFirebaseAdmin();
    if (hasAdminSdk) {
        firebaseUid = await getUidViaAdminSdk();
    } else {
        console.log('ℹ️   No Firebase Admin credentials — using REST API fallback.');
        firebaseUid = await getUidViaRestApi();
    }

    // Step 2: Postgres user profile
    const pool = new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool, { schema });

    try {
        const existingByUid = await db
            .select()
            .from(users)
            .where(eq(users.firebaseUid, firebaseUid))
            .limit(1);

        if (existingByUid.length > 0) {
            await db.update(users).set({
                role: 'superadmin',
                status: 'active',
                uid: firebaseUid,
                firebaseUid,
                email: SUPERADMIN_EMAIL,
                updatedAt: new Date().toISOString(),
            }).where(eq(users.id, existingByUid[0].id));
            console.log(`✅  Postgres user updated (id=${existingByUid[0].id}) — role=superadmin, status=active`);
        } else {
            const byEmail = await db.select().from(users).where(eq(users.email, SUPERADMIN_EMAIL)).limit(1);

            if (byEmail.length > 0) {
                await db.update(users).set({
                    role: 'superadmin',
                    status: 'active',
                    uid: firebaseUid,
                    firebaseUid,
                    updatedAt: new Date().toISOString(),
                }).where(eq(users.id, byEmail[0].id));
                console.log(`✅  Postgres user (by email) updated (id=${byEmail[0].id})`);
            } else {
                const inserted = await db.insert(users).values({
                    uid: firebaseUid,
                    firebaseUid,
                    email: SUPERADMIN_EMAIL,
                    name: 'Superadmin',
                    firstName: 'Super',
                    lastName: 'Admin',
                    role: 'superadmin',
                    status: 'active',
                }).returning();
                console.log(`✅  Postgres user created (id=${inserted[0].id})`);
            }
        }
    } finally {
        await pool.end();
    }

    console.log('\n🎉  Superadmin seeded successfully!');
    console.log(`    Email:    ${SUPERADMIN_EMAIL}`);
    console.log(`    Password: ${SUPERADMIN_PASSWORD}`);
    console.log(`    Role:     superadmin`);
    console.log(`    Status:   active\n`);
}

seed().catch((err) => {
    console.error('❌  Seed failed:', err);
    process.exit(1);
});

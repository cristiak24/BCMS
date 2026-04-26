import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { db } from '../apps/server/src/db';
import { users } from '../apps/server/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
type ServiceAccountJson = {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
};

const DEFAULT_EMAIL = 'test@test.com';
const DEFAULT_PASSWORD = 'testtest';
const DEFAULT_FIRST_NAME = 'Super';
const DEFAULT_LAST_NAME = 'Admin';
const DEFAULT_ROLE = 'superadmin' as const;

function readEnv(name: string, fallback = '') {
  return (process.env[name] ?? fallback).trim();
}

function loadCredential() {
  const rawServiceAccount = readEnv('FIREBASE_SERVICE_ACCOUNT_KEY');

  if (rawServiceAccount) {
    const parsed = JSON.parse(rawServiceAccount) as ServiceAccountJson;

    if (!parsed.clientEmail || !parsed.privateKey) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY must include clientEmail and privateKey.');
    }

    return cert({
      projectId: parsed.projectId || readEnv('FIREBASE_PROJECT_ID') || undefined,
      clientEmail: parsed.clientEmail,
      privateKey: parsed.privateKey.replace(/\\n/g, '\n'),
    });
  }

  const scriptsDir = path.resolve(process.cwd(), 'scripts');
  if (fs.existsSync(scriptsDir)) {
    const files = fs.readdirSync(scriptsDir);
    const jsonFile = files.find(f => f.startsWith('bcms') && f.endsWith('.json'));
    if (jsonFile) {
      console.log(`Using service account JSON: ${jsonFile}`);
      return cert(path.join(scriptsDir, jsonFile));
    }
  }

  return applicationDefault();
}



async function main() {
  if (!getApps().length) {
    initializeApp({
      credential: loadCredential(),
      projectId: readEnv('FIREBASE_PROJECT_ID') || undefined,
    });
  }

  const auth = getAuth();

  const email = readEnv('SEED_SUPERADMIN_EMAIL', DEFAULT_EMAIL).toLowerCase();
  const password = readEnv('SEED_SUPERADMIN_PASSWORD', DEFAULT_PASSWORD);
  const firstName = readEnv('SEED_SUPERADMIN_FIRST_NAME', DEFAULT_FIRST_NAME);
  const lastName = readEnv('SEED_SUPERADMIN_LAST_NAME', DEFAULT_LAST_NAME);
  const now = new Date().toISOString();

  let userRecord;

  try {
    userRecord = await auth.getUserByEmail(email);
    console.log(`Found existing Auth user for ${email} (${userRecord.uid}).`);
  } catch (error) {
    userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`.trim(),
      emailVerified: true,
    });
    console.log(`Created Auth user for ${email} (${userRecord.uid}).`);
  }

  await auth.updateUser(userRecord.uid, {
    email,
    password,
    emailVerified: true,
    disabled: false,
    displayName: `${firstName} ${lastName}`.trim(),
  });

  await auth.setCustomUserClaims(userRecord.uid, {
    role: DEFAULT_ROLE,
    superadmin: true,
    status: 'active',
  });

  const maxIdRows = await db.select({ id: users.id }).from(users).orderBy(desc(users.id)).limit(1);
  const currentMaxId = maxIdRows[0]?.id ?? 0;
  const nextProfileId = currentMaxId + 1;

  try {
    const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    
    if (existingUser.length > 0) {
      console.log('User profile already exists in PostgreSQL.');
    } else {
      await db.insert(users).values({
        id: nextProfileId,
        uid: userRecord.uid,
        firebaseUid: userRecord.uid,
        email,
        name: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        role: DEFAULT_ROLE,
        status: 'processed', // 'active' is not in enum, using 'processed'
        createdAt: now,
      });
    }
  } catch (err: any) {
    throw err;
  }

  console.log(`Seeded superadmin profile for ${email}.`);
}

main().catch((error) => {
  console.error('Failed to seed superadmin:', error);
  process.exitCode = 1;
});

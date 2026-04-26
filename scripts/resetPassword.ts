import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';

function loadCredential() {
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
    });
  }

  const auth = getAuth();
  const email = 'test@test.com';
  const password = 'testtest';

  try {
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, emailVerified: true });
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      await auth.createUser({ email, password, emailVerified: true, displayName: 'Super Admin' });
    } else {
      throw err;
    }
  }

  const user = await auth.getUserByEmail(email);
  
  // Sync to postgres
  const { db } = await import('../apps/server/src/db');
  const { users } = await import('../apps/server/src/db/schema');
  const { eq } = await import('drizzle-orm');
  await db.update(users).set({ uid: user.uid }).where(eq(users.email, email));

  console.log(`Password for ${email} successfully force reset to ${password} and synced to Postgres with uid ${user.uid}.`);
}

main().catch(console.error);

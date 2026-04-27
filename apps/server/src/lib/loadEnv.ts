import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

export function loadServerEnv() {
  const candidates = [
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(process.cwd(), 'apps/server/.env.local'),
    path.resolve(process.cwd(), '.env.local'),
  ];

  const localEnvPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (localEnvPath) {
    dotenv.config({ path: localEnvPath, override: false });
  }
}

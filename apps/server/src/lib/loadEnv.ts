import dotenv from 'dotenv';
import path from 'path';

export function loadServerEnv() {
  const localEnvPath = path.resolve(__dirname, '../../.env.local');

  dotenv.config({ path: localEnvPath, override: false });
}

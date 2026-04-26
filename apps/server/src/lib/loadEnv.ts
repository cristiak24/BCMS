import dotenv from 'dotenv';
import path from 'path';

export function loadServerEnv() {
  const localEnvPath = path.resolve(__dirname, '../../.env.local');
  const envPath = path.resolve(__dirname, '../../.env');

  dotenv.config({ path: localEnvPath, override: false });
  dotenv.config({ path: envPath, override: false });
}

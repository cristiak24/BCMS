/**
 * The app's own Vite config (apps/client/vite.config.ts) plus ONE change:
 * imports of context/AuthContext resolve to e2e/support/client/mockAuth.tsx,
 * so the E2E build signs in without Clerk. Used only by e2e/support/client/serve.ts;
 * the production build (`npm run build:web`) never sees this file.
 *
 * vite and the React plugin live in apps/client/node_modules (not hoisted),
 * hence the relative imports.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig, type Plugin, type UserConfig } from '../../../apps/client/node_modules/vite/dist/node/index.js';
import appConfig from '../../../apps/client/vite.config';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(here, '../../../apps/client');
const mockAuth = path.join(here, 'mockAuth.tsx');

function e2eAuthMock(): Plugin {
  return {
    name: 'bcms-e2e-auth-mock',
    enforce: 'pre',
    resolveId(source) {
      if (/(^|\/)context\/AuthContext(\.tsx?)?$/.test(source)) return mockAuth;
      return null;
    },
  };
}

export default defineConfig((env) => {
  const base = typeof appConfig === 'function' ? appConfig(env) : appConfig;
  return mergeConfig(base as UserConfig, {
    root: clientRoot,
    plugins: [e2eAuthMock()],
    resolve: { dedupe: ['react', 'react-dom'] },
    // The mock lives outside the app root.
    server: { fs: { allow: [clientRoot, here] } },
  });
});

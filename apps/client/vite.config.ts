import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function originOf(url: string | undefined) {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/** Clerk's Frontend API host is base64-encoded in the publishable key. */
function clerkFrontendOrigin(publishableKey: string | undefined) {
  const encoded = publishableKey?.split('_')[2];
  if (!encoded) return null;
  try {
    const host = Buffer.from(encoded, 'base64').toString('utf8').replace(/\$$/, '');
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

/**
 * Open the TLS connections to the API and to Clerk while the bundle is still
 * downloading. Both are on the cold-start critical path (Clerk's script, then
 * /auth/me), and on mobile each new origin costs DNS + TCP + TLS round trips.
 */
function preconnectOrigins(mode: string): Plugin {
  const env = loadEnv(mode, __dirname, ['VITE_', 'EXPO_PUBLIC_']);
  const origins = [
    originOf(env.EXPO_PUBLIC_API_URL),
    clerkFrontendOrigin(env.VITE_CLERK_PUBLISHABLE_KEY || env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY),
  ].filter((origin): origin is string => Boolean(origin));

  return {
    name: 'bcms-preconnect',
    transformIndexHtml() {
      return origins.map((href) => ({
        tag: 'link',
        attrs: { rel: 'preconnect', href, crossorigin: '' },
        injectTo: 'head-prepend' as const,
      }));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), preconnectOrigins(mode)],
  envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname) },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split the largest, self-contained vendor libraries out of the main app
        // chunk so the initial payload is smaller and these rarely-changing deps
        // stay cacheable across app deploys.
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('/react-dom/')) {
            return 'react-dom';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.EXPO_PUBLIC_WEB_PORT || process.env.PORT || 8091),
  },
}));

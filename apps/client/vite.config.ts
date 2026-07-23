import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
          if (id.includes('/firebase/') || id.includes('/@firebase/')) {
            return 'firebase';
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
});

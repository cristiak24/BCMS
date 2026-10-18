/**
 * Builds the client with the E2E Vite config (production mode: hashed chunks,
 * no StrictMode double fetches) into a temporary folder and serves it the way
 * Cloudflare does in production (wrangler.toml
 * `not_found_handling = "single-page-application"`): an existing file is
 * served as is, ANY missing path — /assets/*.js included — gets index.html
 * with status 200. That fallback is what the stale-chunk test relies on.
 *
 *   tsx e2e/support/client/serve.ts   (started by e2e/playwright.config.ts)
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { E2E } from '../env';

const here = __dirname;
const outDir = path.join(E2E.stateDir, 'web');

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

async function build() {
  // vite is ESM-only and not hoisted out of apps/client.
  const vite: typeof import('vite') = await import(
    pathToFileURL(path.resolve(here, '../../../apps/client/node_modules/vite/dist/node/index.js')).href
  );
  // Build-time env of the app: the API of the E2E server, and a placeholder
  // Clerk key (config/clerk.ts requires one; Clerk itself is never loaded).
  process.env.EXPO_PUBLIC_API_URL = E2E.apiUrl;
  process.env.VITE_CLERK_PUBLISHABLE_KEY = 'pk_test_e2e';
  // Tailwind's `content` globs are relative to the working directory.
  process.chdir(path.resolve(here, '../../../apps/client'));
  await vite.build({
    configFile: path.join(here, 'vite.config.mts'),
    mode: 'production',
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true },
  });
}

function serve() {
  const root = path.resolve(outDir);
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'));
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = path.resolve(root, `.${pathname}`);
    if (file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    // SPA fallback, exactly like production — also for a missing /assets/*.js.
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(indexHtml);
  });
  server.listen(E2E.webPort, '127.0.0.1', () => {
    console.log(`[e2e web] ${E2E.webUrl} (build in ${root})`);
  });
}

build().then(serve, (error) => {
  console.error(error);
  process.exit(1);
});

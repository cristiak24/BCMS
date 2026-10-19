/**
 * The Cloudflare Worker in front of the static assets (worker/index.ts).
 *
 * The SPA fallback answers ANY missing path with index.html and 200 — right
 * for /admin/compliance, wrong for /assets/index-OLDHASH.js: a tab still on
 * the previous build then gets HTML for a script, the browser throws a MIME
 * error, and the app only finds out indirectly (src/lazyRoute.ts). A missing
 * hashed asset now answers a real 404, which the browser reports as a plain
 * failed import, and caches nothing.
 */
export function isHashedAssetPath(pathname: string) {
  return pathname.startsWith('/assets/');
}

/** The SPA fallback's answer for a file that does not exist. */
export function isSpaFallback(response: { status: number; headers: { get(name: string): string | null } }) {
  return response.status === 404 || (response.status === 200 && (response.headers.get('content-type') ?? '').includes('text/html'));
}

export function missingAssetResponse() {
  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

type AssetsBinding = { fetch(request: Request): Promise<Response> };

export async function handleAssetRequest(request: Request, assets: AssetsBinding) {
  const response = await assets.fetch(request);
  if (isHashedAssetPath(new URL(request.url).pathname) && isSpaFallback(response)) return missingAssetResponse();
  return response;
}

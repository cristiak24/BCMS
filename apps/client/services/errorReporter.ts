import { buildApiUrl } from '../config/serverUrl';
import {
  buildClientErrorPayload,
  buildIdFromScripts,
  createReportGate,
  type ClientErrorKind,
  type ClientErrorPayload,
} from '../utils/clientErrorReport';
import { peekSessionToken } from './apiClient';

/**
 * Sends browser crashes to POST /api/client-errors, where they are logged as
 * `[client-error]` in the Render logs — a free stand-in for an error tracker.
 * Sources: the ErrorBoundary (render crashes), window `error` and
 * `unhandledrejection`. Each distinct error goes once per page, ten at most;
 * reporting never throws and never waits for sign-in (crashes before login
 * count too). The session token, when there is one, only lets the server
 * note the caller's role.
 */
const gate = createReportGate(10);
let build: string | undefined;

function currentBuild() {
  if (build === undefined && typeof document !== 'undefined') {
    build = buildIdFromScripts(Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'), (script) => script.src)) ?? '';
  }
  return build || undefined;
}

async function send(payload: ClientErrorPayload) {
  const token = await peekSessionToken();
  await fetch(buildApiUrl('/client-errors'), {
    method: 'POST',
    // Survives a reload or tab close right after the crash.
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

export function reportClientError(
  kind: ClientErrorKind,
  error: unknown,
  details: { source?: string; line?: number; col?: number; componentStack?: string | null } = {},
) {
  try {
    if (typeof window === 'undefined') return;
    const payload = buildClientErrorPayload(kind, error, { ...details, path: window.location.pathname, build: currentBuild() });
    if (!payload || !gate(payload)) return;
    void send(payload).catch(() => undefined);
  } catch {
    // Reporting must never become a second crash.
  }
}

let installed = false;

/** Once, at startup (src/main.tsx). */
export function installErrorReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    // A failed <img>/<script> load also fires `error` (no message, no error): not a crash.
    if (!event.error && !event.message) return;
    reportClientError('error', event.error ?? event.message, { source: event.filename, line: event.lineno, col: event.colno });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('rejection', event.reason);
  });
}

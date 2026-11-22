import { isNetworkError } from './networkRetry';

/**
 * What the browser sends to POST /api/client-errors (services/errorReporter.ts)
 * and which errors are worth sending. Pure, see clientErrorReport.test.ts.
 * The server clips and scrubs everything again (lib/clientErrorReport.ts);
 * here the page address goes without its query or hash (tokens live there).
 */
export type ClientErrorKind = 'boundary' | 'error' | 'rejection';

export type ClientErrorPayload = {
  kind: ClientErrorKind;
  message: string;
  source?: string;
  line?: number;
  col?: number;
  stack: string[];
  path: string;
  build?: string;
};

const MAX_FRAMES = 8;
const MAX_TEXT = 300;

/** Not bugs, or already handled where they happen. */
const NOISE = [
  /^Script error\.?$/i, // another origin's script: the browser hides everything
  /ResizeObserver loop/i,
  // A stale chunk after a deploy: src/lazyRoute.ts reloads the page.
  /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Unable to preload CSS/i,
];

function messageOf(error: unknown) {
  if (error instanceof Error) return error.name && error.name !== 'Error' ? `${error.name}: ${error.message}` : error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/**
 * True when an error should not be reported: no-connection failures (the
 * screens handle them, and a gym with no signal would flood the log), the API
 * answering with an error (logged on the server, and its message may name a
 * person), and the noise above.
 */
export function isIgnoredClientError(error: unknown, message = messageOf(error)) {
  if (isNetworkError(error)) return true;
  if (error && typeof error === 'object' && typeof (error as { status?: unknown }).status === 'number') return true;
  return !message.trim() || NOISE.some((pattern) => pattern.test(message));
}

export function buildClientErrorPayload(
  kind: ClientErrorKind,
  error: unknown,
  context: { path: string; build?: string; source?: string; line?: number; col?: number; componentStack?: string | null },
): ClientErrorPayload | null {
  const message = messageOf(error);
  if (isIgnoredClientError(error, message)) return null;
  const stackText = [
    error instanceof Error ? error.stack ?? '' : '',
    context.componentStack ?? '',
  ].join('\n');
  const stack = stackText.split('\n')
    .map((frame) => frame.trim())
    // The first line of a V8 stack repeats the message.
    .filter((frame) => frame && frame !== message && !frame.startsWith(`${message}`))
    .slice(0, MAX_FRAMES)
    .map((frame) => frame.slice(0, 200));
  return {
    kind,
    message: message.slice(0, MAX_TEXT),
    ...(context.source ? { source: context.source.split(/[?#]/)[0].slice(0, 200) } : {}),
    ...(Number.isInteger(context.line) ? { line: context.line } : {}),
    ...(Number.isInteger(context.col) ? { col: context.col } : {}),
    stack,
    path: context.path.split(/[?#]/)[0].slice(0, 200),
    ...(context.build ? { build: context.build } : {}),
  };
}

/**
 * Each distinct error once per page, at most `max` reports in all: a render
 * loop or a failing interval must not send hundreds of requests.
 */
export function createReportGate(max = 10) {
  const seen = new Set<string>();
  return (payload: ClientErrorPayload) => {
    const key = `${payload.kind}|${payload.message}|${payload.source ?? ''}:${payload.line ?? ''}:${payload.col ?? ''}`;
    if (seen.has(key) || seen.size >= max) return false;
    seen.add(key);
    return true;
  };
}

/** The deploy a report came from: the hash of the entry chunk (index-<hash>.js). */
export function buildIdFromScripts(srcs: string[]) {
  for (const src of srcs) {
    const match = /\/assets\/index-([\w-]{6,20})\.js(?:$|\?)/.exec(src);
    if (match) return match[1];
  }
  return undefined;
}

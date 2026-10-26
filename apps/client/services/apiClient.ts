import { buildApiUrl, buildServerUrl } from '../config/serverUrl';
import { messageForStatus, userFacingMessage } from '../utils/errorMessages';
import { isNetworkError, NETWORK_ERROR_MESSAGE, retryOnNetworkError } from '../utils/networkRetry';

type ApiResponseType = 'json' | 'text' | 'blob' | 'void';
type QueryParamValue = string | number | boolean | null | undefined;
type ApiClientConfig = {
  params?: Record<string, QueryParamValue | QueryParamValue[]>;
};
type ApiClientResponse<T> = {
  data: T;
};
const REQUEST_TIMEOUT_MS = 15000;

function readMessageFromPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if ('message' in payload && typeof (payload as any).message === 'string') {
    return (payload as any).message as string;
  }

  if ('error' in payload && typeof (payload as any).error === 'string') {
    return (payload as any).error as string;
  }

  return null;
}

async function readJsonLike<T>(response: Response) {
  const raw = await response.text();

  if (!raw) {
    return undefined as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

/** Error that carries the HTTP status so callers can branch on it. */
export class ApiError extends Error {
  readonly status: number;
  /** The JSON error body, for errors that carry more than a message (e.g. a 409 with choices). */
  readonly data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/** The thing asked for doesn't exist (any more): a page offers „Înapoi”, not „Reîncearcă”. */
export function isNotFound(error: unknown) {
  return error instanceof ApiError && error.status === 404;
}

async function buildError(response: Response) {
  try {
    const payload = await readJsonLike<unknown>(response);
    if (typeof payload === 'string' && payload.trim()) {
      return new ApiError(userFacingMessage(payload, response.status), response.status);
    }

    const payloadMessage = readMessageFromPayload(payload);
    if (payloadMessage) {
      return new ApiError(userFacingMessage(payloadMessage, response.status), response.status, payload);
    }
  } catch {
    return new ApiError(messageForStatus(response.status), response.status);
  }

  return new ApiError(messageForStatus(response.status), response.status);
}

type UnauthorizedHandler = (status: 401 | 403) => void;

let onUnauthorized: UnauthorizedHandler | null = null;

/**
 * Registered once by AuthContext. When the backend rejects a request because the
 * session is gone or the account was deactivated, the app previously kept the
 * stale session in memory and surfaced a raw error string on every screen; now
 * it signs out and returns the user to the login page.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler;
}

type SessionTokenGetter = () => Promise<string | null>;

let sessionTokenGetter: SessionTokenGetter | null = null;
let notifyGetterReady: (() => void) | null = null;
let getterReady = new Promise<void>((resolve) => {
  notifyGetterReady = resolve;
});
const GETTER_WAIT_MS = 3000;

/** Registered once by AuthContext with Clerk's session.getToken(). */
export function setSessionTokenGetter(getter: SessionTokenGetter | null) {
  sessionTokenGetter = getter;
  if (getter) {
    notifyGetterReady?.();
  } else {
    getterReady = new Promise<void>((resolve) => {
      notifyGetterReady = resolve;
    });
  }
}

/** Get the current session token, or null if not logged in */
async function getSessionToken(): Promise<string | null> {
  if (!sessionTokenGetter) {
    // The shell now renders from the cached session before AuthContext's
    // effect registers the getter (child effects run first), so a screen's
    // first request can arrive here early. Sending it without a token would
    // 401 and sign the user out — wait briefly for the registration instead.
    await Promise.race([getterReady, new Promise((resolve) => setTimeout(resolve, GETTER_WAIT_MS))]);
  }
  if (!sessionTokenGetter) return null;
  try {
    return await sessionTokenGetter();
  } catch {
    return null;
  }
}

function isFormDataBody(body: BodyInit | null | undefined) {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

function appendQueryParams(path: string, params?: ApiClientConfig['params']) {
  if (!params) {
    return path;
  }

  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const values = Array.isArray(value) ? value : [value];

    values.forEach((item) => {
      if (item !== null && item !== undefined) {
        searchParams.append(key, String(item));
      }
    });
  });

  const queryString = searchParams.toString();
  if (!queryString) {
    return path;
  }

  return `${path}${path.includes('?') ? '&' : '?'}${queryString}`;
}

function serializeBody(body: unknown): BodyInit | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }

  if (typeof body === 'string' || isFormDataBody(body as BodyInit)) {
    return body as BodyInit;
  }

  return JSON.stringify(body);
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  if (init?.signal) {
    return fetch(url, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

// The API runs on Render's free plan, which sleeps after ~15 min idle and
// needs up to a minute to boot. Every request used to hit the 15s timeout
// during that boot, so a login after a quiet spell sat on the loading screen
// and then rendered a dashboard with no data. A ping to the server root
// (no auth, no CORS preflight) wakes it; requests wait for that instead.
const WAKE_TIMEOUT_MS = 75000;
let wakePromise: Promise<void> | null = null;

/** Wake the API server; resolves once it answers (or gives up), never rejects. */
export function wakeServer(): Promise<void> {
  if (!wakePromise) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);
    wakePromise = fetch(buildServerUrl('/'), { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
      .then(() => undefined, () => undefined)
      .finally(() => {
        clearTimeout(timeout);
        wakePromise = null;
      });
  }
  return wakePromise;
}

const ACTIVE_CHILD_KEY = 'bcms.child-id';

/** The child a parent account is looking at, if they picked one. */
export function getActiveChildId(): number | null {
  try {
    const value = Number(localStorage.getItem(ACTIVE_CHILD_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setActiveChildId(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(ACTIVE_CHILD_KEY);
    else localStorage.setItem(ACTIVE_CHILD_KEY, String(id));
  } catch {
    // Storage blocked: the server falls back to the first child.
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  responseType: ApiResponseType = 'json'
): Promise<T> {
  // The server is still booting from the app-start ping: wait for it rather
  // than burn the request timeout on a sleeping server.
  if (wakePromise) {
    await wakePromise;
  }

  const send = async () => {
    const headers = new Headers(init?.headers);

    // Always try to attach the current session token
    const token = await getSessionToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (!headers.has('Content-Type') && !isFormDataBody(init?.body)) {
      headers.set('Content-Type', 'application/json');
    }

    // A parent's selected child. Only a selection — the server checks it
    // against the parent's own links (apps/server/src/lib/selfPlayer.ts).
    const childId = getActiveChildId();
    if (childId != null && !headers.has('X-BCMS-Child')) {
      headers.set('X-BCMS-Child', String(childId));
    }

    return fetchWithTimeout(buildApiUrl(path), {
      ...init,
      headers,
    });
  };

  // No answer at all (timeout, or the server asleep / mid-deploy): reads are
  // safe to repeat, so they wait for the server to wake and try again a few
  // times — once used to be too few, and the browser's raw "Failed to fetch"
  // reached the login screen. send() mints a fresh token each time (Clerk's
  // expire after 60s). A write is never repeated: it may have gone through.
  const method = (init?.method ?? 'GET').toUpperCase();
  const repeatable = method === 'GET' && !init?.signal;
  let response: Response;
  try {
    response = repeatable
      ? await retryOnNetworkError(send, { beforeRetry: wakeServer })
      : await send();
  } catch (error) {
    if (isNetworkError(error) && !(init?.signal?.aborted)) {
      throw new ApiError(NETWORK_ERROR_MESSAGE, 0);
    }
    throw error;
  }

  if (!response.ok) {
    const error = await buildError(response);

    // Only a 401 (no/expired credentials) or an explicit account-disabled 403
    // ends the session. A plain 403 is an ordinary "you may not do that" —
    // signing the user out of the whole app for it would be a worse bug than
    // the stale-session one this handles.
    //
    // `/auth/me` is excluded because AuthContext calls it precisely to discover
    // whether the session is still valid, and signing out from inside that call
    // would race its own retry loop.
    if (!path.startsWith('/auth/me')) {
      const isDisabledAccount =
        response.status === 403 && /account has been disabled|contul este dezactivat/i.test(error.message);

      if (response.status === 401 || isDisabledAccount) {
        onUnauthorized?.(response.status as 401 | 403);
      }
    }

    throw error;
  }

  if (responseType === 'void' || response.status === 204) {
    return undefined as T;
  }

  if (responseType === 'blob') {
    return (await response.blob()) as T;
  }

  if (responseType === 'text') {
    return (await response.text()) as T;
  }

  return readJsonLike<T>(response);
}

export const apiClient = {
  async get<T>(path: string, config?: ApiClientConfig): Promise<ApiClientResponse<T>> {
    return { data: await apiFetch<T>(appendQueryParams(path, config?.params)) };
  },

  async post<T>(path: string, body?: unknown): Promise<ApiClientResponse<T>> {
    return {
      data: await apiFetch<T>(path, {
        method: 'POST',
        body: serializeBody(body),
      }),
    };
  },

  async put<T>(path: string, body?: unknown): Promise<ApiClientResponse<T>> {
    return {
      data: await apiFetch<T>(path, {
        method: 'PUT',
        body: serializeBody(body),
      }),
    };
  },

  async delete<T = void>(path: string): Promise<ApiClientResponse<T>> {
    return {
      data: await apiFetch<T>(path, { method: 'DELETE' }, 'void'),
    };
  },
};

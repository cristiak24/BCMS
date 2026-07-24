import { buildApiUrl } from '../config/serverUrl';
import { firebaseAuth } from '../config/firebase';

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

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function buildError(response: Response) {
  const fallbackMessage = `Request failed with status ${response.status}`;

  try {
    const payload = await readJsonLike<unknown>(response);
    if (typeof payload === 'string' && payload.trim()) {
      return new ApiError(payload, response.status);
    }

    const payloadMessage = readMessageFromPayload(payload);
    if (payloadMessage) {
      return new ApiError(payloadMessage, response.status);
    }
  } catch {
    return new ApiError(fallbackMessage, response.status);
  }

  return new ApiError(fallbackMessage, response.status);
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

/** Get the current Firebase ID token, or null if not logged in */
async function getFirebaseIdToken(): Promise<string | null> {
  try {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) return null;
    return await currentUser.getIdToken();
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

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  responseType: ApiResponseType = 'json'
): Promise<T> {
  const headers = new Headers(init?.headers);

  // Always try to attach Firebase ID token
  const token = await getFirebaseIdToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && !isFormDataBody(init?.body)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetchWithTimeout(buildApiUrl(path), {
    ...init,
    headers,
  });

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

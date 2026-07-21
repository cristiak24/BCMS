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

async function buildError(response: Response) {
  const fallbackMessage = `Request failed with status ${response.status}`;

  try {
    const payload = await readJsonLike<unknown>(response);
    if (typeof payload === 'string' && payload.trim()) {
      return new Error(payload);
    }

    const payloadMessage = readMessageFromPayload(payload);
    if (payloadMessage) {
      return new Error(payloadMessage);
    }
  } catch {
    return new Error(fallbackMessage);
  }

  return new Error(fallbackMessage);
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
    throw await buildError(response);
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

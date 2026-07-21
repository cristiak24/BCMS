import Constants from '@/src/web/constants';
import { Platform } from '@/src/web/reactNative';
import { getClientEnv } from './env';

const DEFAULT_API_PORT = getClientEnv('EXPO_PUBLIC_API_PORT') || '3000';
const EXPLICIT_API_URL = getClientEnv('EXPO_PUBLIC_API_URL');
const EXPLICIT_APP_URL = getClientEnv('EXPO_PUBLIC_APP_URL');

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function extractHost(candidate?: string | null) {
  if (!candidate) {
    return null;
  }

  const withoutProtocol = candidate.replace(/^[a-z]+:\/\//i, '');
  const withoutPath = withoutProtocol.split('/')[0];
  const [host] = withoutPath.split(':');

  return host || null;
}

function getWebHost() {
  if (
    typeof globalThis !== 'undefined' &&
    'location' in globalThis &&
    globalThis.location &&
    typeof globalThis.location.hostname === 'string'
  ) {
    return globalThis.location.hostname;
  }

  return 'localhost';
}

function getWebOrigin() {
  if (
    typeof globalThis !== 'undefined' &&
    'location' in globalThis &&
    globalThis.location &&
    typeof globalThis.location.origin === 'string'
  ) {
    return globalThis.location.origin.replace(/\/+$/, '');
  }

  return null;
}

function resolveExpoDevHost() {
  return (
    extractHost(Constants.expoConfig?.hostUri) ||
    extractHost((Constants.expoGoConfig as { debuggerHost?: string } | null)?.debuggerHost) ||
    extractHost((Constants.manifest2 as { extra?: { expoClient?: { hostUri?: string } } } | null)?.extra?.expoClient?.hostUri)
  );
}

function resolveServerBaseUrl() {
  if (EXPLICIT_API_URL) {
    const apiUrl = stripTrailingSlash(EXPLICIT_API_URL);
    if (/^https?:\/\//i.test(apiUrl)) {
      return apiUrl.replace(/\/api$/, '');
    }

    if (Platform.OS === 'web' && typeof globalThis.location?.origin === 'string') {
      return globalThis.location.origin.replace(/\/+$/, '');
    }

    return '';
  }

  if (Platform.OS === 'web') {
    const webHost = getWebHost();
    const webOrigin = getWebOrigin();

    if (webOrigin && !['localhost', '127.0.0.1'].includes(webHost)) {
      return webOrigin;
    }

    return `http://${webHost}:${DEFAULT_API_PORT}`;
  }

  const expoHost = resolveExpoDevHost();
  if (expoHost) {
    return `http://${expoHost}:${DEFAULT_API_PORT}`;
  }

  const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${fallbackHost}:${DEFAULT_API_PORT}`;
}

export const SERVER_BASE_URL = resolveServerBaseUrl();
export const API_URL = EXPLICIT_API_URL ? stripTrailingSlash(EXPLICIT_API_URL) : `${SERVER_BASE_URL}/api`;

export function buildServerUrl(path = '') {
  if (!path) {
    return SERVER_BASE_URL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SERVER_BASE_URL}${normalizedPath}`;
}

export function buildApiUrl(path = '') {
  if (!path) {
    return API_URL;
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/api')
    ? path
    : `/api${path.startsWith('/') ? path : `/${path}`}`;

  return buildServerUrl(normalizedPath);
}

export function getPublicAppUrl() {
  if (EXPLICIT_APP_URL) {
    return stripTrailingSlash(EXPLICIT_APP_URL);
  }

  if (Platform.OS === 'web' && typeof globalThis.location?.origin === 'string') {
    return globalThis.location.origin.replace(/\/+$/, '');
  }

  return SERVER_BASE_URL;
}

export function resolveDocumentUrl(path?: string | null) {
  if (!path) {
    return null;
  }

  return buildServerUrl(path);
}

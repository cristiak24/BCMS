"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePublicAppUrl = resolvePublicAppUrl;
function isLocalUrl(value) {
    try {
        const hostname = new URL(value).hostname.toLowerCase();
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
    }
    catch {
        return false;
    }
}
function isDeployedRuntime() {
    return Boolean(process.env.NODE_ENV === 'production' ||
        process.env.GCLOUD_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET);
}
function normalizePublicUrl(value) {
    const trimmed = value?.trim().replace(/\/+$/, '');
    if (!trimmed) {
        return null;
    }
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return isDeployedRuntime() && isLocalUrl(withProtocol) ? null : withProtocol;
}
function resolvePublicAppUrl() {
    const candidates = [
        process.env.APP_PUBLIC_URL,
        process.env.APP_BASE_URL,
        process.env.FRONTEND_URL,
        process.env.FIREBASE_HOSTING_URL,
    ];
    for (const candidate of candidates) {
        const normalized = normalizePublicUrl(candidate);
        if (normalized) {
            return normalized;
        }
    }
    return 'https://bcms.ro';
}

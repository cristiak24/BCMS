import { useCallback, useEffect, useState } from 'react';
import { pushApi, type PushDevice, type PushKind } from '../../services/pushApi';
import { isStandalone } from './installApp';

/**
 * Web push in the browser (Val 3B). The permission prompt only ever follows a
 * tap on „Activează” — never on opening the app. On iPhone push exists only in
 * the app added to the home screen (iOS 16.4+), never in Safari itself.
 */

export type PushSupport = 'supported' | 'ios-not-installed' | 'ios-too-old' | 'unsupported';

function isIos() {
    const ua = navigator.userAgent;
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
}

function inAppBrowser() {
    return /FBAN|FBAV|Instagram|Line\/|WhatsApp|Messenger/i.test(navigator.userAgent);
}

function hasPushApis() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushSupport(): PushSupport {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
    if (isIos()) {
        if (!isStandalone()) return 'ios-not-installed';
        return hasPushApis() ? 'supported' : 'ios-too-old';
    }
    if (inAppBrowser() || !hasPushApis()) return 'unsupported';
    return 'supported';
}

export type PushPermission = 'default' | 'granted' | 'denied';

export function pushPermission(): PushPermission {
    if (typeof Notification === 'undefined') return 'default';
    return Notification.permission as PushPermission;
}

/** „iPhone · aplicația”, „Android · Chrome”, „Mac · Safari”. No full user agent. */
export function deviceLabel() {
    const ua = navigator.userAgent;
    const device = /iPhone|iPod/.test(ua) ? 'iPhone'
        : /iPad/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1) ? 'iPad'
            : /Android/i.test(ua) ? 'Android'
                : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
                    : /Windows/.test(ua) ? 'Windows'
                        : /Linux|CrOS/.test(ua) ? 'Linux' : 'Calculator';
    const browser = isStandalone() ? 'aplicația'
        : /Edg\//.test(ua) ? 'Edge'
            : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
                : /Firefox|FxiOS/.test(ua) ? 'Firefox'
                    : /OPR\//.test(ua) ? 'Opera'
                        : /Chrome|CriOS/.test(ua) ? 'Chrome'
                            : /Safari/.test(ua) ? 'Safari' : 'browser';
    return `${device} · ${browser}`;
}

const READY_TIMEOUT_MS = 5000;

/** The app's service worker (registered in src/main.tsx), or null. */
async function registration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    const existing = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    if (existing) return existing;
    // Not registered yet (the app registers it on `load`): wait a little.
    const ready = navigator.serviceWorker.ready.then((reg) => reg, () => null);
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), READY_TIMEOUT_MS));
    return Promise.race([ready, timeout]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
    if (pushSupport() !== 'supported') return null;
    const reg = await registration();
    return reg ? reg.pushManager.getSubscription().catch(() => null) : null;
}

function keyBytes(base64Url: string) {
    const padded = `${base64Url}${'='.repeat((4 - (base64Url.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
    return bytes;
}

function sameKey(subscription: PushSubscription, publicKey: string) {
    const current = subscription.options?.applicationServerKey;
    if (!current) return true;
    const expected = keyBytes(publicKey);
    const actual = new Uint8Array(current);
    return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

function toBase64Url(buffer: ArrayBuffer | null) {
    if (!buffer) return '';
    let raw = '';
    new Uint8Array(buffer).forEach((byte) => { raw += String.fromCharCode(byte); });
    return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type EnableResult = 'enabled' | 'denied' | 'dismissed' | 'failed';

/**
 * Call straight from the tap: iOS only shows the permission dialog when it is
 * requested inside the user's gesture, so nothing is awaited before it.
 */
export async function enablePush(publicKey: string): Promise<EnableResult> {
    let permission: NotificationPermission;
    try {
        permission = await Notification.requestPermission();
    } catch {
        return 'failed';
    }
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'dismissed';
    try {
        const reg = await registration();
        if (!reg) return 'failed';
        let subscription = await reg.pushManager.getSubscription();
        if (subscription && !sameKey(subscription, publicKey)) {
            // The server's keys changed: the old subscription can't be used.
            await subscription.unsubscribe().catch(() => undefined);
            subscription = null;
        }
        if (!subscription) {
            subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        }
        await pushApi.subscribe({
            endpoint: subscription.endpoint,
            keys: { p256dh: toBase64Url(subscription.getKey('p256dh')), auth: toBase64Url(subscription.getKey('auth')) },
            label: deviceLabel(),
        });
        notifyChange();
        return 'enabled';
    } catch (error) {
        console.warn('[push] subscribe failed:', error);
        return 'failed';
    }
}

/** „Oprește pe acest dispozitiv”. */
export async function disablePush() {
    const subscription = await currentSubscription();
    if (subscription) {
        await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
        await subscription.unsubscribe().catch(() => undefined);
    }
    notifyChange();
}

/**
 * Sign-out: the next person on a shared phone must not get this account's
 * notifications. Best effort and bounded — signing out never waits long.
 */
let signingOut: Promise<void> | null = null;

export function unsubscribeOnSignOut() {
    // A 401 during this call signs out again (apiClient): share the one run.
    if (!signingOut) signingOut = runSignOutUnsubscribe().finally(() => { signingOut = null; });
    return signingOut;
}

async function runSignOutUnsubscribe() {
    try {
        const work = (async () => {
            const subscription = await currentSubscription();
            if (!subscription) return;
            await pushApi.unsubscribe(subscription.endpoint).catch(() => undefined);
            await subscription.unsubscribe().catch(() => undefined);
        })();
        await Promise.race([work, new Promise((resolve) => setTimeout(resolve, 3000))]);
    } catch {
        // Never block signing out.
    }
}

const listeners = new Set<() => void>();
function notifyChange() {
    listeners.forEach((listener) => listener());
}

export type PushState = {
    loading: boolean;
    support: PushSupport;
    permission: PushPermission;
    /** The server has VAPID keys. */
    serverEnabled: boolean;
    publicKey: string | null;
    kinds: PushKind[];
    preferences: Partial<Record<PushKind, boolean>>;
    devices: PushDevice[];
    /** This browser's endpoint, when it is subscribed AND known to the server. */
    currentEndpoint: string | null;
};

const INITIAL: PushState = {
    loading: true,
    support: 'unsupported',
    permission: 'default',
    serverEnabled: false,
    publicKey: null,
    kinds: [],
    preferences: {},
    devices: [],
    currentEndpoint: null,
};

async function loadState(): Promise<PushState> {
    const support = pushSupport();
    const [config, me, subscription] = await Promise.all([
        pushApi.config().catch(() => ({ enabled: false, publicKey: null })),
        pushApi.me().catch(() => null),
        currentSubscription(),
    ]);
    const endpoint = subscription?.endpoint ?? null;
    const devices = me?.devices ?? [];
    return {
        loading: false,
        support,
        permission: pushPermission(),
        serverEnabled: Boolean(config.enabled && config.publicKey && me?.enabled),
        publicKey: config.publicKey,
        kinds: me?.kinds ?? [],
        preferences: me?.preferences ?? {},
        devices,
        currentEndpoint: endpoint && devices.some((device) => device.endpoint === endpoint) ? endpoint : null,
    };
}

/** State for the profile card and the in-context invitation. */
export function usePushState() {
    const [state, setState] = useState<PushState>(INITIAL);
    const reload = useCallback(async () => {
        const next = await loadState();
        setState(next);
        return next;
    }, []);
    useEffect(() => {
        let alive = true;
        const refresh = () => { void loadState().then((next) => { if (alive) setState(next); }); };
        refresh();
        listeners.add(refresh);
        // Back from the browser's settings: the permission may have changed.
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            alive = false;
            listeners.delete(refresh);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);
    return { state, setState, reload };
}

const NUDGE_KEY = 'bcms.push-nudge-at';
const NUDGE_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function nudgeSnoozed() {
    try {
        const at = Number(localStorage.getItem(NUDGE_KEY));
        return Number.isFinite(at) && at > 0 && Date.now() - at < NUDGE_SNOOZE_MS;
    } catch {
        return false;
    }
}

export function snoozeNudge() {
    try {
        localStorage.setItem(NUDGE_KEY, String(Date.now()));
    } catch {
        // Storage blocked: it may show again, nothing worse.
    }
}

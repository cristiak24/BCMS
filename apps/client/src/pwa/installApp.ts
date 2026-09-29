import { useEffect, useState } from 'react';

/**
 * "Install the app" support.
 *
 * Chrome on Android / desktop fires `beforeinstallprompt`; we keep that event
 * so an in-app button can open the native install dialog later. iOS has no
 * such event in any browser (Safari, Chrome, Edge all use WebKit there) — the
 * only route is Share → "Adaugă pe ecranul principal", so on iOS we show
 * instructions instead. That is why the laptop offered an install button and
 * the iPhone never did.
 */

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Call once, as early as possible (the event can fire before React mounts). */
export function captureInstallPrompt() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (event) => {
        // Keeps Android's own mini-infobar from popping up at a random moment;
        // our banner / profile card offers the install instead.
        event.preventDefault();
        deferredPrompt = event as BeforeInstallPromptEvent;
        notify();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        installed = true;
        notify();
    });
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';
export type IosBrowser = 'safari' | 'chrome' | 'other' | 'in-app';

function detectPlatform(): InstallPlatform {
    const ua = navigator.userAgent;
    const iPadOs = navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1;
    if (/iPad|iPhone|iPod/.test(ua) || iPadOs) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
}

function detectIosBrowser(): IosBrowser {
    const ua = navigator.userAgent;
    if (/FBAN|FBAV|Instagram|Line\/|WhatsApp|Messenger/i.test(ua)) return 'in-app';
    if (/CriOS/i.test(ua)) return 'chrome';
    if (/FxiOS|EdgiOS|OPiOS/i.test(ua)) return 'other';
    return 'safari';
}

export function isStandalone() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches
        || (navigator as any).standalone === true;
}

export function useInstallApp() {
    const [, force] = useState(0);
    useEffect(() => {
        const listener = () => force((n) => n + 1);
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, []);

    const platform = typeof navigator === 'undefined' ? 'desktop' : detectPlatform();
    const standalone = installed || isStandalone();

    return {
        standalone,
        platform,
        iosBrowser: platform === 'ios' ? detectIosBrowser() : null,
        /** Native install dialog available (Chrome/Edge on Android & desktop). */
        canPrompt: deferredPrompt != null && !standalone,
        /** Something useful to offer: a native prompt or iOS instructions. */
        canOffer: !standalone && (deferredPrompt != null || platform === 'ios'),
        async promptInstall(): Promise<boolean> {
            if (!deferredPrompt) return false;
            const event = deferredPrompt;
            deferredPrompt = null;
            await event.prompt();
            const choice = await event.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
            notify();
            return choice.outcome === 'accepted';
        },
    };
}

const DISMISS_KEY = 'bcms.install-dismissed-at';
const DISMISS_FOR_MS = 30 * 24 * 60 * 60 * 1000;

export function wasInstallBannerDismissed() {
    try {
        const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
        return Date.now() - at < DISMISS_FOR_MS;
    } catch {
        return false;
    }
}

export function dismissInstallBanner() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
}

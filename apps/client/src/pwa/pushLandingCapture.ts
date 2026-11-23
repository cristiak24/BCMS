import { setActiveChildId } from '../../services/apiClient';

/**
 * Where a tapped push lands (Val 3B). The link carries `child` (a parent's
 * child the notification is about) and `n` (the in-app notification, marked
 * read once signed in). Both are taken out of the address before any screen
 * reads it. The child is only a selection: the server checks it against the
 * parent's own links (X-BCMS-Child), and the child switcher drops one that
 * isn't theirs. Kept free of React and the auth code: src/main.tsx runs it
 * before the app's own chunks load.
 */

export const PENDING_READ_KEY = 'bcms.push-read';

export function positiveInt(value: string | null) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
}

/** Splits the push parameters off a same-app path. */
export function parsePushPath(path: string) {
    const url = new URL(path, window.location.origin);
    const child = positiveInt(url.searchParams.get('child'));
    const notificationId = positiveInt(url.searchParams.get('n'));
    url.searchParams.delete('child');
    url.searchParams.delete('n');
    return { path: `${url.pathname}${url.search}${url.hash}`, child, notificationId, sameOrigin: url.origin === window.location.origin };
}

export function rememberRead(id: number | null) {
    if (id == null) return;
    try {
        sessionStorage.setItem(PENDING_READ_KEY, String(id));
    } catch {
        // Storage blocked: the notification simply stays unread.
    }
}

/** Before the first render (src/main.tsx): the app was opened from a push. */
export function capturePushLanding() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('child') && !params.has('n')) return;
    const landing = parsePushPath(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    if (landing.child != null) setActiveChildId(landing.child);
    rememberRead(landing.notificationId);
    window.history.replaceState(window.history.state, '', landing.path);
}


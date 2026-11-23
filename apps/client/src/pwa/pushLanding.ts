import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../context/AuthContext';
import { getActiveChildId, setActiveChildId } from '../../services/apiClient';
import { notificationsApi } from '../../services/notificationsApi';
import { refreshUnreadNotifications } from '../../hooks/useNotifications';
import { PENDING_READ_KEY, parsePushPath, positiveInt, rememberRead } from './pushLandingCapture';

async function markPendingRead() {
    let id: number | null = null;
    try {
        id = positiveInt(sessionStorage.getItem(PENDING_READ_KEY));
        sessionStorage.removeItem(PENDING_READ_KEY);
    } catch {
        return;
    }
    if (id == null) return;
    await notificationsApi.markAsRead(id).catch(() => undefined);
    void refreshUnreadNotifications();
}

/**
 * Mounted once in App: marks the opening notification read once signed in,
 * and routes a push tapped while the app is already open (the service worker
 * posts `bcms:push-open`).
 */
export function PushLanding() {
    const { session } = useSession();
    const navigate = useNavigate();
    const signedIn = Boolean(session);

    useEffect(() => {
        if (signedIn) void markPendingRead();
    }, [signedIn]);

    useEffect(() => {
        if (!('serviceWorker' in navigator)) return undefined;
        const onMessage = (event: MessageEvent) => {
            const data = event.data as { type?: unknown; url?: unknown } | null;
            if (!data || data.type !== 'bcms:push-open' || typeof data.url !== 'string' || !data.url.startsWith('/') || data.url.startsWith('//')) return;
            const landing = parsePushPath(data.url);
            if (!landing.sameOrigin) return;
            rememberRead(landing.notificationId);
            if (landing.child != null && landing.child !== getActiveChildId()) {
                // Another child: every screen's data is scoped to the selection,
                // so start clean — as the child switcher does.
                setActiveChildId(landing.child);
                window.location.assign(landing.path);
                return;
            }
            navigate(landing.path);
            void markPendingRead();
        };
        navigator.serviceWorker.addEventListener('message', onMessage);
        return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    }, [navigate]);

    return null;
}

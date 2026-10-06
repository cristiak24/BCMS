import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi, type AppNotification } from '../services/notificationsApi';
import { useSession } from '../context/AuthContext';

const POLL_INTERVAL_MS = 45000;

/*
 * One shared unread-count poller for the whole app. AppHeader is mounted twice
 * (mobile + desktop variants), and each copy used to poll on its own — two
 * identical requests every 45s, also while the tab sat in the background.
 */
let sharedCount = 0;
const subscribers = new Set<(count: number) => void>();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;

function publish(count: number) {
    sharedCount = count;
    subscribers.forEach((listener) => listener(count));
}

function fetchUnreadCount() {
    if (inflight) return inflight;
    inflight = notificationsApi.getUnreadCount()
        .then(publish)
        .catch(() => {
            // Transient network errors shouldn't surface anywhere for a badge count.
        })
        .finally(() => {
            inflight = null;
        });
    return inflight;
}

function onVisibilityChange() {
    if (document.visibilityState === 'visible') void fetchUnreadCount();
}

function startPolling() {
    void fetchUnreadCount();
    pollTimer = setInterval(() => {
        if (document.visibilityState === 'visible') void fetchUnreadCount();
    }, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
}

function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
}

function subscribe(listener: (count: number) => void) {
    subscribers.add(listener);
    if (subscribers.size === 1) startPolling();
    return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) stopPolling();
    };
}

export function useNotifications() {
    const { session } = useSession();
    const isLoggedIn = Boolean(session);
    const [unreadCount, setUnreadCountState] = useState(() => (isLoggedIn ? sharedCount : 0));
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const hasLoadedList = useRef(false);

    const refreshUnreadCount = useCallback(async () => {
        if (!isLoggedIn) return;
        await fetchUnreadCount();
    }, [isLoggedIn]);

    // Optimistic updates go through the shared store so both headers agree.
    const setUnreadCount = useCallback((next: number | ((previous: number) => number)) => {
        publish(typeof next === 'function' ? next(sharedCount) : next);
    }, []);

    const loadNotifications = useCallback(async () => {
        if (!isLoggedIn) return;
        setLoading(true);
        try {
            const rows = await notificationsApi.getNotifications();
            setNotifications(rows);
            hasLoadedList.current = true;
        } catch {
            // Leave the previous list in place on failure.
        } finally {
            setLoading(false);
        }
    }, [isLoggedIn]);

    useEffect(() => {
        if (!isLoggedIn) {
            sharedCount = 0;
            setUnreadCountState(0);
            setNotifications([]);
            hasLoadedList.current = false;
            return;
        }

        setUnreadCountState(sharedCount);
        return subscribe(setUnreadCountState);
    }, [isLoggedIn]);

    const markAsRead = useCallback(async (id: number) => {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
        try {
            await notificationsApi.markAsRead(id);
        } catch {
            refreshUnreadCount();
        }
    }, [refreshUnreadCount]);

    const markAllAsRead = useCallback(async () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        try {
            await notificationsApi.markAllAsRead();
        } catch {
            refreshUnreadCount();
        }
    }, [refreshUnreadCount]);

    return {
        unreadCount,
        notifications,
        loading,
        loadNotifications,
        markAsRead,
        markAllAsRead,
    };
}

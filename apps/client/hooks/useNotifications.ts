import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationsApi, type AppNotification } from '../services/notificationsApi';
import { useFirebaseAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 45000;

export function useNotifications() {
    const { session } = useFirebaseAuth();
    const isLoggedIn = Boolean(session);
    const [unreadCount, setUnreadCount] = useState(0);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [loading, setLoading] = useState(false);
    const hasLoadedList = useRef(false);

    const refreshUnreadCount = useCallback(async () => {
        if (!isLoggedIn) return;
        try {
            const count = await notificationsApi.getUnreadCount();
            setUnreadCount(count);
        } catch {
            // Transient network errors shouldn't surface anywhere for a badge count.
        }
    }, [isLoggedIn]);

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
            setUnreadCount(0);
            setNotifications([]);
            hasLoadedList.current = false;
            return;
        }

        refreshUnreadCount();
        const interval = setInterval(refreshUnreadCount, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [isLoggedIn, refreshUnreadCount]);

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

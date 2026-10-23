import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isClubAdmin } from '../utils/authSession';
import { useSession } from '../context/AuthContext';
import { manageAccessApi } from '../services/manageAccessApi';
import type { AccessRequestItem } from '../types/manageAccess';

type RequestAction = 'approve' | 'deny' | null;

export function useManageAccess() {
    const { session, initializing } = useSession();
    const sessionCanAdmin = useMemo(() => Boolean(session && isClubAdmin(session, session.clubId)), [session]);
    const [verifiedIsAdmin, setVerifiedIsAdmin] = useState<boolean | null>(null);
    const isAdmin = verifiedIsAdmin ?? sessionCanAdmin;
    const hasResolvedSession = !initializing;
    const [authError, setAuthError] = useState<string | null>(null);
    const [requests, setRequests] = useState<AccessRequestItem[]>([]);
    const [requestsLoading, setRequestsLoading] = useState(true);
    const [requestsError, setRequestsError] = useState<string | null>(null);
    const [requestAction, setRequestAction] = useState<{ id: number; type: RequestAction } | null>(null);

    const isMountedRef = useRef(true);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // The session already carries a verified role + clubId (issued by the backend
    // at login), so admin status is derived from it directly. There is no need for
    // an extra profileApi.getProfile() round-trip on every session change — any
    // admin-only endpoint this page calls is still enforced server-side.
    const resolveAccessState = useCallback(async () => {
        setAuthError(null);

        if (initializing) {
            return;
        }

        if (!isMountedRef.current) {
            return;
        }

        if (!session) {
            setAuthError('Autentifică-te din nou pentru a gestiona accesul.');
            setVerifiedIsAdmin(false);
            setRequestsLoading(false);
            return;
        }

        setVerifiedIsAdmin(sessionCanAdmin);

        if (!sessionCanAdmin) {
            setAuthError('Doar administratorii clubului pot gestiona accesul.');
            setRequestsLoading(false);
        }
    }, [initializing, session, sessionCanAdmin]);

    useEffect(() => {
        void resolveAccessState();
    }, [resolveAccessState]);

    const loadRequests = useCallback(async () => {
        setRequestsLoading(true);
        setRequestsError(null);

        try {
            const data = await manageAccessApi.listRequests();
            setRequests(data);
        } catch (error) {
            setRequestsError(error instanceof Error ? error.message : 'Nu am putut încărca cererile de acces.');
        } finally {
            setRequestsLoading(false);
        }
    }, []);

    // Load the requests once the session resolves.
    useEffect(() => {
        if (!hasResolvedSession || !isAdmin) {
            setRequestsLoading(false);
            return;
        }

        void loadRequests();
    }, [hasResolvedSession, isAdmin, loadRequests]);

    const approveRequest = useCallback(async (id: number): Promise<boolean> => {
        setRequestAction({ id, type: 'approve' });

        try {
            await manageAccessApi.approveRequest(id);
            setRequests((current) => current.map((request) => (
                request.id === id
                    ? { ...request, status: 'approved', reviewedAt: new Date().toISOString() }
                    : request
            )));
            return true;
        } catch {
            // Surfaced as a toast by the page; the list itself stays visible.
            return false;
        } finally {
            setRequestAction(null);
        }
    }, []);

    const denyRequest = useCallback(async (id: number): Promise<boolean> => {
        setRequestAction({ id, type: 'deny' });

        try {
            await manageAccessApi.denyRequest(id);
            setRequests((current) => current.map((request) => (
                request.id === id
                    ? { ...request, status: 'denied', reviewedAt: new Date().toISOString() }
                    : request
            )));
            return true;
        } catch {
            // Surfaced as a toast by the page; the list itself stays visible.
            return false;
        } finally {
            setRequestAction(null);
        }
    }, []);

    const pendingCount = useMemo(
        () => requests.filter((request) => request.status === 'pending').length,
        [requests]
    );

    return {
        isAdmin,
        hasResolvedSession,
        requests,
        pendingCount,
        requestsLoading,
        requestsError,
        requestAction,
        refreshAccessState: resolveAccessState,
        loadRequests,
        approveRequest,
        denyRequest,
        authError,
    };
}

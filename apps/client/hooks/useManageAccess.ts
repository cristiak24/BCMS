import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isClubAdmin } from '../utils/authSession';
import { useFirebaseAuth } from '../context/AuthContext';
import { manageAccessApi } from '../services/manageAccessApi';
import type { AccessRequestItem, InviteLinkItem, InviteRole } from '../types/manageAccess';
import { DEFAULT_REFRESH_INTERVAL_MINUTES, isInviteExpired } from '../utils/manageAccess';

type RequestAction = 'approve' | 'deny' | null;

export function useManageAccess() {
    const { session, initializing } = useFirebaseAuth();
    const sessionCanAdmin = useMemo(() => Boolean(session && isClubAdmin(session, session.clubId)), [session]);
    const [verifiedIsAdmin, setVerifiedIsAdmin] = useState<boolean | null>(null);
    const isAdmin = verifiedIsAdmin ?? sessionCanAdmin;
    const hasResolvedSession = !initializing;
    const [authError, setAuthError] = useState<string | null>(null);
    const [requests, setRequests] = useState<AccessRequestItem[]>([]);
    const [requestsLoading, setRequestsLoading] = useState(true);
    const [requestsError, setRequestsError] = useState<string | null>(null);
    const [requestAction, setRequestAction] = useState<{ id: number; type: RequestAction } | null>(null);

    const [selectedRole, setSelectedRole] = useState<InviteRole>('player');
    const [refreshIntervalMinutes, setRefreshIntervalMinutes] = useState(DEFAULT_REFRESH_INTERVAL_MINUTES);
    const [inviteLink, setInviteLink] = useState<InviteLinkItem | null>(null);
    const [inviteLoading, setInviteLoading] = useState(true);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [regenerating, setRegenerating] = useState(false);
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
            setAuthError('Please sign in again to manage access.');
            setVerifiedIsAdmin(false);
            setRequestsLoading(false);
            setInviteLoading(false);
            return;
        }

        setVerifiedIsAdmin(sessionCanAdmin);

        if (!sessionCanAdmin) {
            setAuthError('Only club admins can manage access.');
            setRequestsLoading(false);
            setInviteLoading(false);
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
            setRequestsError(error instanceof Error ? error.message : 'Could not load access requests.');
        } finally {
            setRequestsLoading(false);
        }
    }, []);

    const loadInviteLink = useCallback(async (role: InviteRole) => {
        setInviteLoading(true);
        setInviteError(null);

        try {
            const activeLink = await manageAccessApi.getActiveInviteLink(role);
            setInviteLink(activeLink);
            if (activeLink) {
                setRefreshIntervalMinutes(activeLink.refreshIntervalMinutes);
            }
        } catch (error) {
            setInviteError(error instanceof Error ? error.message : 'Could not load the invite link.');
            setInviteLink(null);
        } finally {
            setInviteLoading(false);
        }
    }, []);

    // Access requests don't depend on the selected role — load them once the
    // session resolves, not on every role switch.
    useEffect(() => {
        if (!hasResolvedSession || !isAdmin) {
            setRequestsLoading(false);
            return;
        }

        void loadRequests();
    }, [hasResolvedSession, isAdmin, loadRequests]);

    // The active invite link is role-scoped, so (re)load it whenever the selected
    // role changes. This is the single source of the invite-link fetch — callers
    // just call setSelectedRole and let this effect do the load (no duplicate).
    useEffect(() => {
        if (!hasResolvedSession || !isAdmin) {
            setInviteLoading(false);
            return;
        }

        void loadInviteLink(selectedRole);
    }, [hasResolvedSession, isAdmin, loadInviteLink, selectedRole]);

    const regenerateInviteLink = useCallback(async (role: InviteRole, interval = refreshIntervalMinutes): Promise<boolean> => {
        setRegenerating(true);
        setInviteError(null);

        try {
            // generate returns the freshly created active link, so a follow-up
            // getActiveInviteLink call would just repeat the same fetch.
            const nextLink = await manageAccessApi.generateInviteLink(role, interval);
            setInviteLink(nextLink);
            setRefreshIntervalMinutes(nextLink.refreshIntervalMinutes);
            return true;
        } catch (error) {
            setInviteError(error instanceof Error ? error.message : 'Could not regenerate the invite link.');
            return false;
        } finally {
            setRegenerating(false);
            setInviteLoading(false);
        }
    }, [refreshIntervalMinutes]);

    useEffect(() => {
        if (!inviteLink || !isAdmin) {
            return;
        }

        const msUntilRefresh = new Date(inviteLink.expiresAt).getTime() - Date.now();

        if (msUntilRefresh <= 0) {
            setInviteLink(null);
            return;
        }

        const timer = setTimeout(() => {
            setInviteLink(null);
        }, msUntilRefresh + 250);

        return () => clearTimeout(timer);
    }, [inviteLink, isAdmin]);

    const approveRequest = useCallback(async (id: number): Promise<boolean> => {
        setRequestAction({ id, type: 'approve' });
        setRequestsError(null);

        try {
            await manageAccessApi.approveRequest(id);
            setRequests((current) => current.map((request) => (
                request.id === id
                    ? { ...request, status: 'approved', reviewedAt: new Date().toISOString() }
                    : request
            )));
            return true;
        } catch (error) {
            setRequestsError(error instanceof Error ? error.message : 'Could not approve the request.');
            return false;
        } finally {
            setRequestAction(null);
        }
    }, []);

    const denyRequest = useCallback(async (id: number): Promise<boolean> => {
        setRequestAction({ id, type: 'deny' });
        setRequestsError(null);

        try {
            await manageAccessApi.denyRequest(id);
            setRequests((current) => current.map((request) => (
                request.id === id
                    ? { ...request, status: 'denied', reviewedAt: new Date().toISOString() }
                    : request
            )));
            return true;
        } catch (error) {
            setRequestsError(error instanceof Error ? error.message : 'Could not deny the request.');
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
        inviteLink,
        inviteLoading,
        inviteError,
        regenerating,
        selectedRole,
        refreshIntervalMinutes,
        requestAction,
        setSelectedRole,
        setRefreshIntervalMinutes,
        refreshAccessState: resolveAccessState,
        loadRequests,
        loadInviteLink,
        approveRequest,
        denyRequest,
        regenerateInviteLink,
        isCurrentInviteExpired: inviteLink ? isInviteExpired(inviteLink.expiresAt) : false,
        authError,
    };
}

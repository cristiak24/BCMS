import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isClubAdmin } from '../utils/authSession';
import { useFirebaseAuth } from '../context/AuthContext';
import { manageAccessApi } from '../services/manageAccessApi';
import { profileApi } from '../services/profileApi';
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
            return;
        }

        try {
            const currentUser = await profileApi.getProfile();
            if (!isMountedRef.current) {
                return;
            }
            setVerifiedIsAdmin(isClubAdmin(currentUser, currentUser.clubId));
        } catch (error) {
            if (!isMountedRef.current) {
                return;
            }
            if (sessionCanAdmin) {
                setAuthError(null);
                setVerifiedIsAdmin(true);
            } else {
                setVerifiedIsAdmin(false);
                setAuthError(error instanceof Error ? error.message : 'Could not verify your admin access.');
            }
        }
    }, [initializing, session]);

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

    useEffect(() => {
        if (!hasResolvedSession || !isAdmin) {
            setRequestsLoading(false);
            setInviteLoading(false);
            return;
        }

        void loadRequests();
        void loadInviteLink(selectedRole);
    }, [hasResolvedSession, isAdmin, loadInviteLink, loadRequests, selectedRole]);

    const regenerateInviteLink = useCallback(async (role: InviteRole, interval = refreshIntervalMinutes) => {
        setRegenerating(true);
        setInviteError(null);

        try {
            const nextLink = await manageAccessApi.generateInviteLink(role, interval);
            const activeLink = await manageAccessApi.getActiveInviteLink(role);
            const resolvedLink = activeLink ?? nextLink;
            setInviteLink(resolvedLink);
            setRefreshIntervalMinutes(resolvedLink.refreshIntervalMinutes);
        } catch (error) {
            setInviteError(error instanceof Error ? error.message : 'Could not regenerate the invite link.');
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

    const approveRequest = useCallback(async (id: number) => {
        setRequestAction({ id, type: 'approve' });
        setRequestsError(null);

        try {
            await manageAccessApi.approveRequest(id);
            setRequests((current) => current.map((request) => (
                request.id === id
                    ? { ...request, status: 'approved', reviewedAt: new Date().toISOString() }
                    : request
            )));
        } catch (error) {
            setRequestsError(error instanceof Error ? error.message : 'Could not approve the request.');
        } finally {
            setRequestAction(null);
        }
    }, []);

    const denyRequest = useCallback(async (id: number) => {
        setRequestAction({ id, type: 'deny' });
        setRequestsError(null);

        try {
            await manageAccessApi.denyRequest(id);
            setRequests((current) => current.map((request) => (
                request.id === id
                    ? { ...request, status: 'denied', reviewedAt: new Date().toISOString() }
                    : request
            )));
        } catch (error) {
            setRequestsError(error instanceof Error ? error.message : 'Could not deny the request.');
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

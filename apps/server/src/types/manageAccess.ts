export type InviteRole = 'player' | 'parent' | 'coach';
export type AccessRequestStatus = 'pending' | 'approved' | 'denied';
export type UserAccessStatus = 'pending' | 'processed' | 'rejected';

export type AppUserContext = {
    id: number;
    email: string;
    name: string;
    role: 'admin' | 'player' | 'parent' | 'coach' | 'accountant';
    clubId: number | null;
    status?: UserAccessStatus;
    isHardcodedAdmin?: boolean;
};

export type AccessRequestRecord = {
    id: number;
    userId: number;
    clubId: number;
    userName: string;
    userEmail: string;
    requestedRole: InviteRole;
    status: AccessRequestStatus;
    createdAt: string;
    reviewedAt: string | null;
    reviewedBy: number | null;
};

export type InviteLinkRecord = {
    id: number;
    clubId: number;
    clubName: string;
    role: InviteRole;
    token: string;
    expiresAt: string;
    refreshIntervalMinutes: number;
    createdAt: string;
    isActive: boolean;
};

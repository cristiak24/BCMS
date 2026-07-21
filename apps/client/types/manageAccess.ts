export type InviteRole = 'player' | 'parent' | 'coach';
export type AccessRequestStatus = 'pending' | 'approved' | 'denied';

export type AccessRequestItem = {
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

export type InviteLinkItem = {
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

export type RefreshIntervalOption = {
    label: string;
    value: number;
};

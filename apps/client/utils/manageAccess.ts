import type { InviteLinkItem } from '../types/manageAccess';
import { getPublicAppUrl } from '../config/serverUrl';

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 30;
export const PRESET_REFRESH_INTERVALS = [10, 30, 60];

export function formatTimeRemaining(expiresAt: string) {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();

    if (remainingMs <= 0) {
        return 'Expired';
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);
    const normalizedMinutes = minutes % 60;

    if (hours > 0) {
        return `${hours}h ${String(normalizedMinutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function buildInviteRegistrationUrl(inviteLink: InviteLinkItem) {
    const query = new URLSearchParams({
        inviteToken: inviteLink.token,
        clubId: String(inviteLink.clubId),
        role: inviteLink.role,
        expiresAt: inviteLink.expiresAt,
    });

    return `${getPublicAppUrl()}/signup?${query.toString()}`;
}

export function isInviteExpired(expiresAt: string) {
    return new Date(expiresAt).getTime() <= Date.now();
}

import type { InviteLinkItem } from '../types/manageAccess';
import { getPublicAppUrl } from '../config/serverUrl';

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 30;
/** Server clamps the lifetime to 5–1440 minutes. */
export const MIN_REFRESH_INTERVAL_MINUTES = 5;
export const MAX_REFRESH_INTERVAL_MINUTES = 24 * 60;
export const PRESET_REFRESH_INTERVALS = [30, 60, 24 * 60];

export function formatIntervalLabel(minutes: number) {
    if (minutes % (24 * 60) === 0) {
        const days = minutes / (24 * 60);
        return days === 1 ? '1 zi' : `${days} zile`;
    }
    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return hours === 1 ? '1 oră' : `${hours} ore`;
    }
    return `${minutes} min`;
}

export function formatTimeRemaining(expiresAt: string) {
    const remainingMs = new Date(expiresAt).getTime() - Date.now();

    if (remainingMs <= 0) {
        return 'Expirat';
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(minutes / 60);
    const normalizedMinutes = minutes % 60;

    if (hours > 0) {
        // Seconds are noise at this range and made the label too wide on phones.
        return `${hours}h ${String(normalizedMinutes).padStart(2, '0')}m`;
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

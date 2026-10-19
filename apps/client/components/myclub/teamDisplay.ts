import { parseApiDate } from '@/utils/dates';
import type { TeamGender, TeamLevel } from '../../services/teamsApi';
import { plural } from '../../utils/plural';

export const LEVEL_LABELS: Record<TeamLevel, string> = {
    national: 'Național',
    municipal: 'Municipal',
    initiere: 'Inițiere',
};

export const GENDER_LABELS: Record<TeamGender, string> = {
    M: 'Masculin',
    F: 'Feminin',
};

export function isFrbTeam(team: { frbTeamId: string }) {
    return team.frbTeamId.trim().length > 0;
}

export function computeAge(birthYear: number | null | undefined) {
    if (!birthYear || birthYear < 1900) return null;
    return new Date().getFullYear() - birthYear;
}

export { medicalStatus, type MedicalStatus } from '../../utils/medicalVisa';
import type { MedicalStatus } from '../../utils/medicalVisa';

export const MEDICAL_META: Record<MedicalStatus, { label: string; bg: string; fg: string }> = {
    valid: { label: 'Viză valabilă', bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
    soon: { label: 'Expiră curând', bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' },
    expired: { label: 'Viză expirată', bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)' },
    missing: { label: 'Fără viză', bg: 'var(--c-surface-3)', fg: 'var(--c-muted)' },
};

export function formatDate(iso: string | null | undefined) {
    if (!iso) return '—';
    const date = parseApiDate(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelativeDate(iso: string | null | undefined) {
    if (!iso) return '—';
    const date = parseApiDate(iso);
    if (Number.isNaN(date.getTime())) return '—';

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return 'acum câteva secunde';
    if (diffMinutes < 60) return `acum ${diffMinutes} min`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `acum ${plural(diffHours, 'oră', 'ore')}`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `acum ${plural(diffDays, 'zi', 'zile')}`;
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

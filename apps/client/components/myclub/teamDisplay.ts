import type { TeamGender, TeamLevel } from '../../services/teamsApi';

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

export type MedicalStatus = 'valid' | 'soon' | 'expired' | 'missing';

export function medicalStatus(expiry: string | null | undefined): MedicalStatus {
    if (!expiry) return 'missing';
    const time = new Date(expiry).getTime();
    if (Number.isNaN(time)) return 'missing';
    const now = Date.now();
    if (time < now) return 'expired';
    const days = (time - now) / 86400000;
    if (days <= 30) return 'soon';
    return 'valid';
}

export const MEDICAL_META: Record<MedicalStatus, { label: string; bg: string; fg: string }> = {
    valid: { label: 'Vizită validă', bg: '#E6F8F1', fg: '#0B7A55' },
    soon: { label: 'Expiră curând', bg: '#FCF3E3', fg: '#B45309' },
    expired: { label: 'Vizită expirată', bg: '#FBEAEA', fg: '#B42318' },
    missing: { label: 'Fără vizită', bg: '#F1F5F9', fg: '#64748B' },
};

export function formatDate(iso: string | null | undefined) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelativeDate(iso: string | null | undefined) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) return 'acum câteva secunde';
    if (diffMinutes < 60) return `acum ${diffMinutes} min`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `acum ${diffHours} ${diffHours === 1 ? 'oră' : 'ore'}`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `acum ${diffDays} ${diffDays === 1 ? 'zi' : 'zile'}`;
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

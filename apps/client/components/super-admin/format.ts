import type { ClubRole } from '../../services/superAdminApi';

/** Copy and formatting shared by the super admin screens (Romanian only). */

export const SUPER_ADMIN_SEARCH_PLACEHOLDER = 'Caută utilizatori, emailuri sau cluburi…';

export const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Super admin',
  admin: 'Administrator',
  coach: 'Antrenor',
  accountant: 'Contabil',
  staff: 'Staff',
  player: 'Jucător',
  parent: 'Părinte',
};

export const ROLE_LABEL_PLURAL: Record<ClubRole, string> = {
  admin: 'Administratori',
  coach: 'Antrenori',
  accountant: 'Contabili',
  staff: 'Staff',
  player: 'Jucători',
  parent: 'Părinți',
};

const ROLE_LABEL_ONE: Record<ClubRole, string> = {
  admin: 'administrator',
  coach: 'antrenor',
  accountant: 'contabil',
  staff: 'staff',
  player: 'jucător',
  parent: 'părinte',
};

/** "1 părinte", "12 părinți", "20 de jucători". */
export function roleCount(role: ClubRole, count: number) {
  return plural(count, ROLE_LABEL_ONE[role], ROLE_LABEL_PLURAL[role].toLowerCase());
}

/** Lower-case without diacritics, so "mures" finds "Mureș". */
export function fold(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export const CLUB_ROLE_ORDER: ClubRole[] = ['admin', 'coach', 'staff', 'accountant', 'player', 'parent'];

export const roleLabel = (role: string | null | undefined) => (role ? ROLE_LABEL[role] ?? role : '—');

export const ROLE_VISUAL: Record<string, { tint: string; fg: string }> = {
  admin: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-strong)' },
  superadmin: { tint: 'var(--c-surface-tint)', fg: 'var(--c-brand-strong)' },
  coach: { tint: 'var(--c-sky-bg)', fg: 'var(--c-sky-fg)' },
  player: { tint: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' },
  parent: { tint: 'var(--c-purple-bg)', fg: 'var(--c-purple-fg)' },
  accountant: { tint: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' },
  staff: { tint: 'var(--c-surface-3)', fg: 'var(--c-ink-soft)' },
};

export const roleVisual = (role: string) => ROLE_VISUAL[role] ?? { tint: 'var(--c-surface-3)', fg: 'var(--c-muted)' };

export function statusVisual(status: string) {
  if (status === 'invited') return { dot: 'var(--c-warning)', fg: 'var(--c-warning-fg)', label: 'Invitat' };
  if (status === 'disabled') return { dot: 'var(--c-danger)', fg: 'var(--c-danger-fg)', label: 'Dezactivat' };
  if (status === 'pending') return { dot: 'var(--c-sky)', fg: 'var(--c-sky-fg)', label: 'Neterminat' };
  return { dot: 'var(--c-success)', fg: 'var(--c-success-fg)', label: 'Activ' };
}

export function initialsOf(name: string, email = '') {
  const base = (name && name.trim()) || email || '?';
  const parts = base.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : base.slice(0, 2);
  return letters.toUpperCase();
}

const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const MONTHS_SHORT = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "2026-10" → "octombrie 2026". */
export function monthLabel(month: string, short = false) {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  return short ? `${MONTHS_SHORT[mon - 1]}` : `${MONTHS[mon - 1]} ${year}`;
}

const moneyFormat = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatMoney(value: number | null | undefined) {
  if (value == null) return '—';
  return `${moneyFormat.format(value)} lei`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('ro-RO').format(value);
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelative(iso: string | null | undefined, never = 'Niciodată') {
  if (!iso) return never;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return never;
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 2) return 'acum';
  if (minutes < 60) return `acum ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `acum ${hours} ${hours === 1 ? 'oră' : 'ore'}`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ieri';
  if (days < 30) return `acum ${days} zile`;
  return formatDate(iso);
}

/** Days since a timestamp, or null when it never happened. */
export function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : (Date.now() - time) / 86400000;
}

/** Romanian plural agreement: 1 cont, 2 conturi, 20 de conturi. */
export function plural(count: number, one: string, many: string) {
  if (count === 1) return `1 ${one}`;
  const rest = count % 100;
  const de = count !== 0 && (rest === 0 || rest >= 20);
  return `${formatNumber(count)} ${de ? 'de ' : ''}${many}`;
}

/** Percentage change, or null when there is no base to compare against. */
export function deltaPercent(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Downloads rows as a UTF-8 CSV that Excel opens with diacritics intact. */
export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // Semicolons: Excel with a Romanian locale splits on ";" not ",".
  const csv = rows.map((row) => row.map(escape).join(';')).join('\r\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

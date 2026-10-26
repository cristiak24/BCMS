import { parseApiDate } from '@/utils/dates';
import { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from '@/src/web/reactNative';
import Button from '../ui/Button';
import { EmptyState } from '../ui/ScreenState';
import SelectField from '../ui/SelectField';
import type { AuditLogEntry, AuditLogFilters, AuditLogPage } from '../../services/clubAdminApi';
import { plural } from '../../utils/plural';

/**
 * The audit trail, newest first, in Romanian, with a category filter and
 * paging. Shared by the club admin's Jurnal and the superadmin console.
 */

// Families of actions: 17 single prefixes (Invitații / Acces și cereri /
// Înregistrări / Conturi / Utilizatori overlapped) became 6 an admin can
// tell apart. Each sends its prefixes comma-separated to the server.
type Category = 'all' | 'schedule' | 'squad' | 'money' | 'access' | 'documents' | 'clubs';

const CATEGORY_OPTIONS: { key: Category; label: string; prefixes: string[]; platformOnly?: boolean }[] = [
    { key: 'all', label: 'Toate acțiunile', prefixes: [] },
    { key: 'schedule', label: 'Program, prezență și meciuri', prefixes: ['event.', 'attendance.', 'game.'] },
    { key: 'squad', label: 'Lot, echipe și familii', prefixes: ['player.', 'team.', 'family.', 'family_request.'] },
    { key: 'money', label: 'Bani', prefixes: ['finance.'] },
    { key: 'access', label: 'Conturi, invitații și cereri', prefixes: ['club_admin.', 'user.', 'manage_access.', 'invitation.', 'auth.'] },
    { key: 'documents', label: 'Documente și date personale', prefixes: ['document.', 'privacy.'] },
    { key: 'clubs', label: 'Cluburi', prefixes: ['club.'], platformOnly: true },
];

const ACTION_LABELS: Record<string, string> = {
    'attendance.saved': 'Prezență notată',
    'auth.signup_with_guardian_invite': 'Părinte înregistrat cu invitație personală',
    'auth.signup_with_invite_code': 'Cont creat cu cod de invitație',
    'auth.signup_with_team_code': 'Cerere de înscriere cu codul echipei',
    'club.created': 'Club creat',
    'club.updated': 'Club modificat (nume, preț sau notițe)',
    'club_admin.invitation_revoked': 'Invitație anulată',
    'club_admin.user_deactivated': 'Cont dezactivat',
    'club_admin.user_deleted': 'Cont șters',
    'club_admin.user_reactivated': 'Cont reactivat',
    'club_admin.user_role_updated': 'Rol schimbat',
    'document.deleted': 'Document șters',
    'document.uploaded': 'Document încărcat',
    'event.cancelled': 'Eveniment anulat',
    'event.created': 'Eveniment creat',
    'event.deleted': 'Eveniment șters',
    'event.updated': 'Eveniment modificat',
    'family.guardian_invite_create': 'Invitație pentru părinte',
    'family_request.approve': 'Înscriere aprobată',
    'family_request.deny': 'Înscriere respinsă',
    'finance.document.status': 'Status document financiar',
    'finance.payment.manual': 'Plată înregistrată manual',
    'finance.payment.reversed': 'Plată stornată',
    'finance.settings.update': 'Taxe modificate',
    'finance.stripe.account_created': 'Cont Stripe al clubului creat',
    'finance.stripe.account_updated': 'Contul Stripe al clubului s-a schimbat',
    'game.finished': 'Meci încheiat',
    'game.reopened': 'Meci redeschis',
    'invitation.accepted': 'Invitație acceptată',
    // Created, not „trimisă”: when the email fails the invitation still exists and the admin passes the link on.
    'invitation.created': 'Invitație creată',
    'invitation.resent': 'Invitație retrimisă',
    'invitation.revoked': 'Invitație anulată',
    'manage_access.invite_code_created': 'Cod de invitație creat',
    'manage_access.invite_code_revoked': 'Cod de invitație anulat',
    'manage_access.invite_link_generated': 'Link de invitație generat',
    'manage_access.request_approved': 'Cerere de acces aprobată',
    'manage_access.request_denied': 'Cerere de acces respinsă',
    'player.email_changed': 'Email schimbat',
    'player.updated': 'Fișă modificată',
    'player.removed_from_roster': 'Scos din lot',
    'player.added_to_team': 'Adăugat în echipă',
    'player.removed_from_team': 'Scos din echipă',
    'privacy.erasure_requested': 'Cerere de ștergere a datelor',
    'privacy.erasure_resolved': 'Cerere de ștergere rezolvată',
    'privacy.export': 'Export de date personale',
    'player.contacts_updated': 'Telefoane modificate',
    'team.join_code_close': 'Înscrieri cu codul echipei oprite',
    'team.join_code_open': 'Înscrieri cu codul echipei deschise',
    'team.join_code_rotate': 'Cod de echipă regenerat',
    'user.deactivated': 'Cont dezactivat',
    'user.reactivated': 'Cont reactivat',
    'user.registration_completed': 'Înregistrare finalizată',
    'user.role_updated': 'Rol schimbat',
    'user.updated': 'Cont modificat',
};

export const auditActionLabel = (action: string) => ACTION_LABELS[action] ?? action;

const ROLE_LABELS: Record<string, string> = {
    superadmin: 'administrator platformă', admin: 'administrator', coach: 'antrenor', player: 'jucător', parent: 'părinte', accountant: 'contabil', staff: 'personal',
};

const FIELD_LABELS: Record<string, string> = {
    monthlyPlayerFee: 'cotizație', trainingLevy: 'contribuție antrenament', facilityFee: 'taxă bază', paymentDueDay: 'zi limită',
    autoAdjust: 'ajustare automată', billingStartMonth: 'restanțe din luna',
    firstName: 'prenume', lastName: 'nume', name: 'nume complet', status: 'status', number: 'număr',
    birthYear: 'an naștere', medicalCheckExpiry: 'viză medicală', avatarUrl: 'poză',
    title: 'titlu', startTime: 'început', endTime: 'sfârșit', location: 'locație', type: 'tip', coachId: 'antrenor',
    amount: 'taxă', description: 'descriere', coachNote: 'notă antrenor', opponent: 'adversar', teamId: 'echipă',
    phone: 'telefon', guardianName: 'părinte 1', guardianPhone: 'telefon părinte 1', guardian2Name: 'părinte 2', guardian2Phone: 'telefon părinte 2',
};

function shortValue(value: unknown) {
    if (value == null || value === '') return '—';
    const text = String(value);
    // ISO dates (medical visa) read better as a day.
    return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
const METHOD_LABELS: Record<string, string> = { cash: 'numerar', transfer: 'transfer bancar', card: 'card', other: 'altă metodă' };
const STATUS_LABELS: Record<string, string> = { pending: 'în așteptare', processed: 'aprobat', rejected: 'respins' };
const ENTITY_LABELS: Record<string, string> = {
    player_payment: 'plata', financial_settings: 'setări taxe', financial_document: 'documentul', user: 'contul', player: 'jucătorul',
    invitation: 'invitația', club: 'clubul', team: 'echipa', access_request: 'cererea',
    event: 'evenimentul', club_document: 'documentul', family_join_request: 'cererea de înscriere',
    club_invite_code: 'codul de invitație', invite_link: 'linkul de invitație',
};

/** „plata #15 · Radu Stan”, „jucătorul Radu Stan”: who the entry is about, by name when the server knows it. */
function subjectOf(entry: AuditLogEntry) {
    const label = ENTITY_LABELS[entry.entityType] ?? entry.entityType.replace(/_/g, ' ');
    if (entry.entityType === 'player' && entry.subjectName) return `${label} ${entry.subjectName}`;
    const base = entry.entityId ? `${label} #${entry.entityId}` : label;
    return entry.subjectName ? `${base} · ${entry.subjectName}` : base;
}

function formatWhen(value: string) {
    const date = parseApiDate(value);
    return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

/** A short "before → after" line from the entry's metadata, when it has one. */
function detailOf(entry: AuditLogEntry) {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    if (meta.title) parts.push(`„${shortValue(meta.title)}”`);
    if (typeof meta.startTime === 'string') {
        const when = parseApiDate(meta.startTime);
        if (!Number.isNaN(when.getTime())) parts.push(new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', timeZone: 'Europe/Bucharest' }).format(when));
    }
    if (typeof meta.marked === 'number') parts.push(plural(meta.marked, 'jucător marcat', 'jucători marcați'));
    if (meta.scoreUs != null && meta.scoreThem != null) parts.push(`${meta.scoreUs}–${meta.scoreThem}`);
    if (meta.fileName && !meta.title) parts.push(String(meta.fileName));
    if (meta.previousRole || meta.nextRole) parts.push(`${ROLE_LABELS[String(meta.previousRole)] ?? meta.previousRole ?? '—'} → ${ROLE_LABELS[String(meta.nextRole)] ?? meta.nextRole}`);
    if (meta.previousStatus || meta.nextStatus) parts.push(`${STATUS_LABELS[String(meta.previousStatus)] ?? meta.previousStatus ?? '—'} → ${STATUS_LABELS[String(meta.nextStatus)] ?? meta.nextStatus}`);
    if (typeof meta.chargesEnabled === 'boolean') parts.push(meta.chargesEnabled ? 'poate primi plăți cu cardul' : 'nu mai poate primi plăți cu cardul');
    if (meta.amount != null) parts.push(`${meta.amount} ${String(meta.currency ?? 'ron').toUpperCase()}`);
    if (meta.method) parts.push(METHOD_LABELS[String(meta.method)] ?? String(meta.method));
    if (meta.email) parts.push(String(meta.email));
    if (meta.emailSent === false) parts.push('emailul nu a plecat');
    if (meta.reason) parts.push(`motiv: ${meta.reason}`);
    if (meta.changes && typeof meta.changes === 'object') {
        for (const [field, change] of Object.entries(meta.changes as Record<string, { before: unknown; after: unknown }>)) {
            parts.push(`${FIELD_LABELS[field] ?? field}: ${shortValue(change?.before)} → ${shortValue(change?.after)}`);
        }
    }
    if (meta.before !== undefined || meta.after !== undefined) parts.push(`${meta.before ?? '—'} → ${meta.after ?? '—'}`);
    if (Array.isArray(meta.fields)) parts.push((meta.fields as string[]).map((field) => FIELD_LABELS[field] ?? field).join(', '));
    if (meta.teamName) parts.push(String(meta.teamName));
    if (meta.billingPricePerUser !== undefined) parts.push(`preț/utilizator: ${meta.billingPricePerUser ?? '—'}`);
    if (meta.previousClubId && meta.nextClubId) parts.push('mutat în alt club');
    return parts.join(' · ');
}

/** `platform`: the superadmin console, which also sees the „Cluburi” family. */
export default function AuditLogList({ load, platform = false }: { load: (filters: AuditLogFilters) => Promise<AuditLogPage>; platform?: boolean }) {
    const [category, setCategory] = useState<Category>('all');
    const [page, setPage] = useState(1);
    const [data, setData] = useState<AuditLogPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPage = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const prefixes = CATEGORY_OPTIONS.find((option) => option.key === category)?.prefixes ?? [];
            setData(await load({ page, category: prefixes.length ? prefixes.join(',') : null }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nu am putut încărca jurnalul.');
        } finally {
            setLoading(false);
        }
    }, [load, page, category]);

    useEffect(() => { void fetchPage(); }, [fetchPage]);

    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    return (
        <View className="w-full">
            <View className="flex-row items-center gap-2 flex-wrap mb-3">
                <SelectField<Category>
                    label="Categorie"
                    value={category}
                    onChange={(next) => { setCategory(next); setPage(1); }}
                    options={CATEGORY_OPTIONS.filter((option) => platform || !option.platformOnly)}
                    className="w-full sm:w-[240px]"
                />
                {data ? <Text className="t-meta sm:ml-auto" style={{ color: 'var(--c-muted)' }}>{plural(data.total, 'înregistrare', 'înregistrări')}</Text> : null}
            </View>

            {loading ? (
                <View className="py-10 items-center" accessibilityRole="progressbar" accessibilityLabel="Se încarcă jurnalul">
                    <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                </View>
            ) : error ? (
                <View className="py-8 items-center gap-2">
                    <Text className="text-[13px] font-medium" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
                    <Button size="sm" label="Încearcă din nou" onPress={() => void fetchPage()} />
                </View>
            ) : !data?.logs.length ? (
                // „pentru acest filtru” read wrong under „Toate acțiunile”: say which case it is.
                <EmptyState
                    compact
                    icon="history"
                    title={category === 'all' ? 'Nicio acțiune înregistrată încă' : 'Nimic în această categorie'}
                    message={category === 'all'
                        ? 'Aici apar schimbările la conturi, evenimente, prezență, meciuri, documente și plăți, cu cine și când.'
                        : 'Alege altă categorie sau „Toate acțiunile”.'}
                    actionLabel={category === 'all' ? undefined : 'Toate acțiunile'}
                    onAction={category === 'all' ? undefined : () => { setCategory('all'); setPage(1); }}
                />
            ) : (
                <AuditEntries logs={data.logs} />
            )}

            {data && pages > 1 ? (
                <View className="flex-row items-center justify-center gap-3 mt-3">
                    <Button size="sm" label="Înapoi" icon="chevron-left" disabled={page <= 1 || loading} onPress={() => setPage((p) => p - 1)} />
                    <Text className="t-meta" style={{ color: 'var(--c-muted)' }}>Pagina {page} din {pages}</Text>
                    <Button size="sm" label="Înainte" icon="chevron-right" disabled={page >= pages || loading} onPress={() => setPage((p) => p + 1)} />
                </View>
            ) : null}
        </View>
    );
}

/** The entries themselves — also used for a single player's history. */
export function AuditEntries({ logs }: { logs: AuditLogEntry[] }) {
    return (
        <View className="rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}>
            {logs.map((entry, index) => {
                const detail = detailOf(entry);
                return (
                    <View key={entry.id} className={`px-3.5 py-2.5 ${index ? 'border-t' : ''}`} style={{ borderColor: 'var(--c-border)' } as any}>
                        <View className="flex-row items-start justify-between gap-3">
                            <Text className="text-[13.5px] font-semibold flex-1 min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
                                {ACTION_LABELS[entry.action] ?? entry.action}
                            </Text>
                            <Text className="text-[11.5px] shrink-0" style={{ color: 'var(--c-faint)' }}>{formatWhen(entry.createdAt)}</Text>
                        </View>
                        <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
                            {[
                                entry.actorName ? `${entry.actorName}${entry.actorRole ? ` (${ROLE_LABELS[entry.actorRole] ?? entry.actorRole})` : ''}` : 'Sistem / cont șters',
                                subjectOf(entry),
                                detail || null,
                            ].filter(Boolean).join(' · ')}
                        </Text>
                    </View>
                );
            })}
        </View>
    );
}

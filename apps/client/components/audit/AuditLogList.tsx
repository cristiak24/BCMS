import { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from '@/src/web/reactNative';
import Button from '../ui/Button';
import SelectField from '../ui/SelectField';
import type { AuditLogEntry, AuditLogFilters, AuditLogPage } from '../../services/clubAdminApi';

/**
 * The audit trail, newest first, in Romanian, with a category filter and
 * paging. Shared by the club admin's Jurnal and the superadmin console.
 */

type Category = 'all' | 'finance.' | 'club_admin.' | 'manage_access.' | 'user.' | 'invitation.' | 'auth.' | 'player.' | 'family.';

const CATEGORY_OPTIONS: { key: Category; label: string }[] = [
    { key: 'all', label: 'Toate acțiunile' },
    { key: 'finance.', label: 'Finanțe' },
    { key: 'club_admin.', label: 'Conturi' },
    { key: 'user.', label: 'Utilizatori' },
    { key: 'manage_access.', label: 'Acces și cereri' },
    { key: 'invitation.', label: 'Invitații' },
    { key: 'auth.', label: 'Înregistrări' },
    { key: 'player.', label: 'Jucători' },
    { key: 'family.', label: 'Familii' },
];

const ACTION_LABELS: Record<string, string> = {
    'auth.signup_with_guardian_invite': 'Părinte înregistrat cu invitație personală',
    'auth.signup_with_invite_code': 'Cont creat cu cod de invitație',
    'auth.signup_with_team_code': 'Cerere de înscriere cu codul echipei',
    'club.created': 'Club creat',
    'club_admin.invitation_revoked': 'Invitație anulată',
    'club_admin.user_deactivated': 'Cont dezactivat',
    'club_admin.user_deleted': 'Cont șters',
    'club_admin.user_reactivated': 'Cont reactivat',
    'club_admin.user_role_updated': 'Rol schimbat',
    'family.guardian_invite_create': 'Invitație pentru părinte',
    'finance.document.status': 'Status document financiar',
    'finance.payment.manual': 'Plată înregistrată manual',
    'finance.settings.update': 'Taxe modificate',
    'invitation.accepted': 'Invitație acceptată',
    'invitation.created': 'Invitație trimisă',
    'invitation.resent': 'Invitație retrimisă',
    'invitation.revoked': 'Invitație anulată',
    'manage_access.invite_code_created': 'Cod de invitație creat',
    'manage_access.invite_code_revoked': 'Cod de invitație anulat',
    'manage_access.invite_link_generated': 'Link de invitație generat',
    'manage_access.request_approved': 'Cerere de acces aprobată',
    'manage_access.request_denied': 'Cerere de acces respinsă',
    'player.email_changed': 'Email jucător schimbat',
    'team.join_code_rotate': 'Cod de echipă regenerat',
    'user.deactivated': 'Cont dezactivat',
    'user.registration_completed': 'Înregistrare finalizată',
    'user.role_updated': 'Rol schimbat',
    'user.updated': 'Cont modificat',
};

const ROLE_LABELS: Record<string, string> = {
    superadmin: 'superadmin', admin: 'admin', coach: 'antrenor', player: 'jucător', parent: 'părinte', accountant: 'contabil', staff: 'staff',
};

const FIELD_LABELS: Record<string, string> = {
    monthlyPlayerFee: 'cotizație', trainingLevy: 'contribuție antrenament', facilityFee: 'taxă bază', paymentDueDay: 'zi limită',
    autoAdjust: 'ajustare automată', billingStartMonth: 'restanțe din luna',
};
const METHOD_LABELS: Record<string, string> = { cash: 'numerar', transfer: 'transfer bancar', card: 'card', other: 'altă metodă' };
const STATUS_LABELS: Record<string, string> = { pending: 'în așteptare', processed: 'aprobat', rejected: 'respins' };
const ENTITY_LABELS: Record<string, string> = {
    player_payment: 'plata', financial_settings: 'setări taxe', financial_document: 'documentul', user: 'contul', player: 'jucătorul',
    invitation: 'invitația', club: 'clubul', team: 'echipa', access_request: 'cererea',
};

function formatWhen(value: string) {
    // DB timestamps arrive without a zone and are UTC ("2026-10-07 09:30:00").
    const iso = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
    return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

/** A short "before → after" line from the entry's metadata, when it has one. */
function detailOf(entry: AuditLogEntry) {
    const meta = (entry.metadata ?? {}) as Record<string, unknown>;
    const parts: string[] = [];
    if (meta.previousRole || meta.nextRole) parts.push(`${ROLE_LABELS[String(meta.previousRole)] ?? meta.previousRole ?? '—'} → ${ROLE_LABELS[String(meta.nextRole)] ?? meta.nextRole}`);
    if (meta.previousStatus || meta.nextStatus) parts.push(`${STATUS_LABELS[String(meta.previousStatus)] ?? meta.previousStatus ?? '—'} → ${STATUS_LABELS[String(meta.nextStatus)] ?? meta.nextStatus}`);
    if (meta.amount != null) parts.push(`${meta.amount} ${String(meta.currency ?? 'ron').toUpperCase()}`);
    if (meta.method) parts.push(METHOD_LABELS[String(meta.method)] ?? String(meta.method));
    if (meta.email) parts.push(String(meta.email));
    if (meta.reason) parts.push(`motiv: ${meta.reason}`);
    if (meta.changes && typeof meta.changes === 'object') {
        for (const [field, change] of Object.entries(meta.changes as Record<string, { before: unknown; after: unknown }>)) {
            parts.push(`${FIELD_LABELS[field] ?? field}: ${change?.before ?? '—'} → ${change?.after ?? '—'}`);
        }
    }
    if (meta.before !== undefined || meta.after !== undefined) parts.push(`${meta.before ?? '—'} → ${meta.after ?? '—'}`);
    return parts.join(' · ');
}

export default function AuditLogList({ load }: { load: (filters: AuditLogFilters) => Promise<AuditLogPage> }) {
    const [category, setCategory] = useState<Category>('all');
    const [page, setPage] = useState(1);
    const [data, setData] = useState<AuditLogPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPage = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setData(await load({ page, category: category === 'all' ? null : category }));
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
                    options={CATEGORY_OPTIONS}
                    className="w-full sm:w-[240px]"
                />
                {data ? <Text className="t-meta sm:ml-auto" style={{ color: 'var(--c-muted)' }}>{data.total} {data.total === 1 ? 'înregistrare' : 'înregistrări'}</Text> : null}
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
                <View className="py-8 items-center">
                    <Text className="text-[13px]" style={{ color: 'var(--c-muted)' }}>Nicio acțiune înregistrată pentru acest filtru.</Text>
                </View>
            ) : (
                <View className="rounded-[12px] border overflow-hidden" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}>
                    {data.logs.map((entry, index) => {
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
                                        entry.entityId ? `${ENTITY_LABELS[entry.entityType] ?? entry.entityType} #${entry.entityId}` : ENTITY_LABELS[entry.entityType] ?? entry.entityType,
                                        detail || null,
                                    ].filter(Boolean).join(' · ')}
                                </Text>
                            </View>
                        );
                    })}
                </View>
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

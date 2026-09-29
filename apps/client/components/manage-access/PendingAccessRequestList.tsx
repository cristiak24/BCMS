import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Text, View } from '@/src/web/reactNative';
import { SkeletonList } from '../ui/Skeleton';
import type { AccessRequestItem, AccessRequestStatus } from '../../types/manageAccess';
import { AccessButton, ROLE_LABELS } from './RoleSelector';

const STATUS_META: Record<AccessRequestStatus, { label: string; fg: string; bg: string }> = {
    pending: { label: 'În așteptare', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)' },
    approved: { label: 'Aprobat', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)' },
    denied: { label: 'Respins', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' },
};

const EMPTY_COPY: Record<AccessRequestStatus | 'all', { title: string; body: string }> = {
    pending: { title: 'Nicio cerere în așteptare', body: 'Când cineva se înscrie cu un link sau cod de invitație, cererea apare aici.' },
    approved: { title: 'Nicio cerere aprobată', body: 'Cererile aprobate vor apărea aici.' },
    denied: { title: 'Nicio cerere respinsă', body: 'Cererile respinse vor apărea aici.' },
    all: { title: 'Nicio cerere încă', body: 'Când cineva se înscrie cu un link sau cod de invitație, cererea apare aici.' },
};

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || '?';
}

function formatRequestedAt(iso: string) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (days <= 0) return 'azi';
    if (days === 1) return 'ieri';
    if (days < 7) return `acum ${days} zile`;
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

type Props = {
    items: AccessRequestItem[];
    filter: AccessRequestStatus | 'all';
    searching: boolean;
    loading: boolean;
    error?: string | null;
    actionState?: { id: number; type: 'approve' | 'deny' | null } | null;
    onApprove: (id: number) => void;
    onDeny: (id: number) => void;
    onRetry: () => void;
};

/**
 * Access requests as dense rows: avatar, name/email, role + when, and the two
 * actions inline (on the right from sm up, under the name on phones). Each
 * request used to be a 190px card with a sentence-long status box.
 */
export default function PendingAccessRequestList({
    items,
    filter,
    searching,
    loading,
    error,
    actionState,
    onApprove,
    onDeny,
    onRetry,
}: Props) {
    if (loading) {
        return <SkeletonList count={3} />;
    }

    if (error) {
        return (
            <View className="rounded-[14px] border px-4 py-8 items-center" style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
                <MaterialIcons name="error-outline" size={28} color="var(--c-danger-fg)" />
                <Text className="text-[15px] font-bold mt-2" style={{ color: 'var(--c-ink)' }}>Nu am putut încărca cererile</Text>
                <Text className="t-meta text-center mt-1" style={{ color: 'var(--c-muted)' }}>{error}</Text>
                <AccessButton className="mt-4" variant="secondary" icon="refresh" label="Încearcă din nou" onPress={onRetry} />
            </View>
        );
    }

    if (items.length === 0) {
        const copy = searching
            ? { title: 'Niciun rezultat', body: 'Nicio cerere nu se potrivește căutării.' }
            : EMPTY_COPY[filter];
        return (
            <View className="ui-rise rounded-[14px] border border-dashed px-4 py-10 items-center" style={{ borderColor: 'var(--c-border)' } as any}>
                <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                    <MaterialIcons name={searching ? 'search-off' : 'mark-email-read'} size={22} color="var(--c-brand-fg)" />
                </View>
                <Text className="text-[15px] font-bold mt-3" style={{ color: 'var(--c-ink)' }}>{copy.title}</Text>
                <Text className="t-meta text-center mt-1 max-w-[320px]" style={{ color: 'var(--c-muted)' }}>{copy.body}</Text>
            </View>
        );
    }

    return (
        <View
            className="rounded-[14px] border overflow-hidden ui-stagger"
            style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
            {items.map((item, index) => {
                const isApproving = actionState?.id === item.id && actionState.type === 'approve';
                const isDenying = actionState?.id === item.id && actionState.type === 'deny';
                const meta = STATUS_META[item.status];
                const busy = isApproving || isDenying;
                return (
                    <View
                        key={item.id}
                        className={`px-4 py-3.5 flex-col sm:flex-row sm:items-center gap-3 ${index > 0 ? 'border-t' : ''}`}
                        style={{ borderColor: 'var(--c-border-soft)' } as any}
                    >
                        <View className="flex-row items-center gap-3 flex-1 min-w-0">
                            <View className="w-10 h-10 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                                <Text className="text-[13px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{initials(item.userName)}</Text>
                            </View>
                            <View className="flex-1 min-w-0">
                                <View className="flex-row items-center gap-2">
                                    <Text className="text-[14.5px] font-bold shrink" numberOfLines={1} style={{ color: 'var(--c-ink)' }}>
                                        {item.userName}
                                    </Text>
                                    {filter !== 'pending' || item.status !== 'pending' ? (
                                        <View className="px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: meta.bg }}>
                                            <Text className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.fg }}>{meta.label}</Text>
                                        </View>
                                    ) : null}
                                </View>
                                <Text className="t-meta" numberOfLines={1} style={{ color: 'var(--c-muted)' }}>{item.userEmail}</Text>
                                <Text className="text-[11.5px] mt-0.5" numberOfLines={1} style={{ color: 'var(--c-faint)' }}>
                                    {ROLE_LABELS[item.requestedRole] ?? item.requestedRole} · {formatRequestedAt(item.createdAt)}
                                </Text>
                            </View>
                        </View>

                        {item.status === 'pending' ? (
                            <View className="flex-row gap-2 sm:shrink-0">
                                <AccessButton
                                    className="flex-1 sm:flex-none"
                                    variant="danger"
                                    label="Respinge"
                                    loading={isDenying}
                                    disabled={busy}
                                    onPress={() => onDeny(item.id)}
                                />
                                <AccessButton
                                    className="flex-1 sm:flex-none"
                                    label="Aprobă"
                                    icon="check"
                                    loading={isApproving}
                                    disabled={busy}
                                    onPress={() => onApprove(item.id)}
                                />
                            </View>
                        ) : null}
                    </View>
                );
            })}
        </View>
    );
}

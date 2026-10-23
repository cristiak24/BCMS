import { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { Pressable, Text, View } from '@/src/web/reactNative';
import ConfirmDialog from '../ui/ConfirmDialog';
import { SkeletonList } from '../ui/Skeleton';
import { ROLE_LABELS } from './RoleSelector';
import { manageAccessApi } from '../../services/manageAccessApi';
import type { InviteCodeItem, InviteCodeStatus } from '../../types/manageAccess';

const STATUS_META: Record<InviteCodeStatus, { label: string; fg: string; bg: string }> = {
    active: { label: 'Activ', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)' },
    expired: { label: 'Expirat', fg: 'var(--c-muted)', bg: 'var(--c-surface-3)' },
    exhausted: { label: 'Epuizat', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)' },
    revoked: { label: 'Revocat', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' },
};

function formatExpiry(iso: string) {
    return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function copyText(value: string) {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        return false;
    }
}

type Props = {
    onNotify?: (toast: { variant: 'success' | 'error'; message: string }) => void;
    /** Bumped by the page after „Invită” generates a code, so the list reloads. */
    reloadKey?: number;
};

/**
 * The club's join codes: only the ones that still work, with copy and revoke.
 * Expired, used-up and revoked codes fold into a "Istoric" toggle — they were
 * most of the list and all of the visual noise. New codes come from „Invită”
 * (InviteFlow), which used to be a generator form on this tab.
 */
export default function InviteCodesPanel({ onNotify, reloadKey = 0 }: Props) {
    const [codes, setCodes] = useState<InviteCodeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [freshId, setFreshId] = useState<number | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [pendingRevoke, setPendingRevoke] = useState<InviteCodeItem | null>(null);

    const load = useCallback(async (highlightNewest: boolean) => {
        try {
            setError(null);
            const list = await manageAccessApi.listInviteCodes();
            setCodes(list);
            if (highlightNewest && list[0]) setFreshId(list[0].id);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca codurile.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(reloadKey > 0);
    }, [load, reloadKey]);

    const activeCodes = useMemo(() => codes.filter((item) => item.status === 'active'), [codes]);
    const pastCodes = useMemo(() => codes.filter((item) => item.status !== 'active'), [codes]);

    const handleRevoke = async (item: InviteCodeItem) => {
        try {
            const revoked = await manageAccessApi.revokeInviteCode(item.id);
            setCodes((current) => current.map((code) => (code.id === item.id ? revoked : code)));
            onNotify?.({ variant: 'success', message: `Codul ${item.code} a fost revocat.` });
        } catch (revokeError) {
            onNotify?.({ variant: 'error', message: revokeError instanceof Error ? revokeError.message : 'Nu am putut revoca codul.' });
        }
    };

    const handleCopy = async (item: InviteCodeItem) => {
        if (await copyText(item.code)) {
            setCopiedId(item.id);
            setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 2000);
        }
    };

    const renderCode = (item: InviteCodeItem) => {
        const meta = STATUS_META[item.status];
        const isActive = item.status === 'active';
        const usage = item.maxUses > 0 ? Math.min(1, item.useCount / item.maxUses) : 0;
        return (
            <View
                key={item.id}
                className={`rounded-[12px] border px-3.5 py-3 ${item.id === freshId ? 'ui-rise' : ''}`}
                style={{
                    backgroundColor: 'var(--c-surface)',
                    borderColor: item.id === freshId ? 'var(--c-brand-border)' : 'var(--c-border)',
                    opacity: isActive ? 1 : 0.72,
                } as any}
            >
                <View className="flex-row items-center gap-2">
                    <Text
                        selectable
                        className="text-[16px] font-bold tracking-[0.12em] flex-1 min-w-0"
                        numberOfLines={1}
                        style={{ color: 'var(--c-ink-strong)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as any}
                    >
                        {item.code}
                    </Text>
                    {isActive ? (
                        <>
                            <Pressable
                                onPress={() => void handleCopy(item)}
                                accessibilityRole="button"
                                accessibilityLabel={`Copiază codul ${item.code}`}
                                className="ui-press w-9 h-9 rounded-[9px] items-center justify-center"
                                style={{ backgroundColor: copiedId === item.id ? 'var(--c-success-bg)' : 'var(--c-surface-tint)' }}
                            >
                                <MaterialIcons
                                    name={copiedId === item.id ? 'check' : 'content-copy'}
                                    size={16}
                                    color={copiedId === item.id ? 'var(--c-success-fg)' : 'var(--c-brand-fg)'}
                                />
                            </Pressable>
                            <Pressable
                                onPress={() => setPendingRevoke(item)}
                                accessibilityRole="button"
                                accessibilityLabel={`Revocă codul ${item.code}`}
                                className="ui-press w-9 h-9 rounded-[9px] items-center justify-center"
                                style={{ backgroundColor: 'var(--c-surface-2)' }}
                            >
                                <MaterialIcons name="block" size={16} color="var(--c-danger-fg)" />
                            </Pressable>
                        </>
                    ) : (
                        <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: meta.bg }}>
                            <Text className="text-[10.5px] font-bold uppercase tracking-wide" style={{ color: meta.fg }}>{meta.label}</Text>
                        </View>
                    )}
                </View>
                <Text className="t-meta mt-1" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                    {ROLE_LABELS[item.role]}
                    {item.teamName ? ` · ${item.teamName}` : ''}
                    {isActive ? ` · expiră ${formatExpiry(item.expiresAt)}` : item.status === 'expired' ? ` · a expirat ${formatExpiry(item.expiresAt)}` : ''}
                </Text>
                <View className="flex-row items-center gap-2 mt-2">
                    <View className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                        <View
                            className="h-full rounded-full ui-bar"
                            style={{ width: `${Math.round(usage * 100)}%`, backgroundColor: isActive ? 'var(--c-brand-fg)' : 'var(--c-faint)' } as any}
                        />
                    </View>
                    <Text className="text-[11.5px] font-semibold t-num" style={{ color: 'var(--c-faint)' }}>
                        {item.useCount}/{item.maxUses} conturi
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <View>
            <View className="w-full min-w-0">
                <View className="flex-row items-center justify-between mb-2 px-0.5">
                    <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }}>
                        Coduri active{activeCodes.length ? ` · ${activeCodes.length}` : ''}
                    </Text>
                    {pastCodes.length > 0 ? (
                        <Pressable
                            onPress={() => setShowHistory((value) => !value)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: showHistory }}
                            className="flex-row items-center gap-0.5 h-8 px-1"
                        >
                            <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
                                Istoric ({pastCodes.length})
                            </Text>
                            <MaterialIcons name={showHistory ? 'expand-less' : 'expand-more'} size={18} color="var(--c-brand-fg)" />
                        </Pressable>
                    ) : null}
                </View>

                {loading ? (
                    <SkeletonList count={2} />
                ) : activeCodes.length === 0 ? (
                    <View className="rounded-[12px] border border-dashed px-4 py-5 items-center" style={{ borderColor: 'var(--c-border)' } as any}>
                        <Text className="text-[13px]" style={{ color: error ? 'var(--c-danger-fg)' : 'var(--c-muted)' }}>{error ?? 'Niciun cod activ. Generează unul din „Invită”.'}</Text>
                    </View>
                ) : (
                    <View className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-2 ui-stagger">{activeCodes.map(renderCode)}</View>
                )}

                {showHistory && pastCodes.length > 0 ? (
                    <View className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-2 mt-3">{pastCodes.map(renderCode)}</View>
                ) : null}
            </View>

            <ConfirmDialog
                visible={pendingRevoke != null}
                destructive
                icon="block"
                // Non-breaking hyphen so the code never splits across lines.
                title={pendingRevoke ? `Revoci codul ${pendingRevoke.code.replace(/-/g, '\u2011')}?` : ''}
                message="Codul nu va mai putea fi folosit la înscriere. Conturile create deja cu el rămân active."
                confirmLabel="Revocă"
                cancelLabel="Anulează"
                onConfirm={() => {
                    if (pendingRevoke) void handleRevoke(pendingRevoke);
                    setPendingRevoke(null);
                }}
                onCancel={() => setPendingRevoke(null)}
            />
        </View>
    );
}

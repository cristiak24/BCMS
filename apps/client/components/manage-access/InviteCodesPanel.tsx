import { useCallback, useEffect, useState } from 'react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { ActivityIndicator, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import GlassCard from '../ui/GlassCard';
import RoleSelector from './RoleSelector';
import { manageAccessApi } from '../../services/manageAccessApi';
import type { InviteCodeItem, InviteCodeStatus, InviteRole } from '../../types/manageAccess';

const VALIDITY_OPTIONS: { label: string; hours: number }[] = [
    { label: '1 zi', hours: 24 },
    { label: '3 zile', hours: 72 },
    { label: '7 zile', hours: 24 * 7 },
    { label: '30 zile', hours: 24 * 30 },
];

const ROLE_LABELS: Record<InviteRole, string> = {
    player: 'Jucător',
    parent: 'Părinte',
    coach: 'Antrenor',
};

const STATUS_META: Record<InviteCodeStatus, { label: string; fg: string; bg: string }> = {
    active: { label: 'Activ', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)' },
    expired: { label: 'Expirat', fg: 'var(--c-muted)', bg: 'var(--c-surface-3)' },
    exhausted: { label: 'Epuizat', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)' },
    revoked: { label: 'Revocat', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' },
};

function formatExpiry(iso: string) {
    const date = new Date(iso);
    return date.toLocaleString('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function copyText(value: string) {
    try {
        await navigator.clipboard.writeText(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Short club join codes: the admin picks the role, how long the code works and
 * how many accounts it can create. People type it in "Cod de invitație" on the
 * signup page and join this club with that role right away.
 */
export default function InviteCodesPanel() {
    const [role, setRole] = useState<InviteRole>('player');
    const [validityHours, setValidityHours] = useState(24 * 7);
    const [maxUsesInput, setMaxUsesInput] = useState('25');
    const [codes, setCodes] = useState<InviteCodeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            setCodes(await manageAccessApi.listInviteCodes());
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Nu am putut încărca codurile.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const handleCreate = async () => {
        const maxUses = Number(maxUsesInput);
        if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 500) {
            setError('Numărul maxim de utilizări trebuie să fie între 1 și 500.');
            return;
        }

        setCreating(true);
        setError(null);
        try {
            const created = await manageAccessApi.createInviteCode({ role, expiresInHours: validityHours, maxUses });
            setCodes((current) => [created, ...current]);
        } catch (createError) {
            setError(createError instanceof Error ? createError.message : 'Nu am putut genera codul.');
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (id: number) => {
        try {
            const revoked = await manageAccessApi.revokeInviteCode(id);
            setCodes((current) => current.map((item) => (item.id === id ? revoked : item)));
        } catch (revokeError) {
            setError(revokeError instanceof Error ? revokeError.message : 'Nu am putut revoca codul.');
        }
    };

    const handleCopy = async (item: InviteCodeItem) => {
        if (await copyText(item.code)) {
            setCopiedId(item.id);
            setTimeout(() => setCopiedId((current) => (current === item.id ? null : current)), 2000);
        }
    };

    return (
        <GlassCard className="p-6">
            <View className="flex-row items-center justify-between mb-5">
                <View className="flex-1 pr-4">
                    <Text className="text-xl font-black" style={{ color: 'var(--c-ink-strong)' }}>Coduri de invitație</Text>
                    <Text className="mt-1" style={{ color: 'var(--c-muted)' }}>
                        Un cod scurt pentru un grup. Cine îl folosește la „Creează cont” intră în club cu rolul ales.
                    </Text>
                </View>
                <MaterialIcons name="confirmation-number" size={28} color="var(--c-brand-fg)" />
            </View>

            <Text className="text-sm font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--c-muted)' }}>Rol</Text>
            <RoleSelector selectedRole={role} onSelectRole={setRole} />

            <Text className="text-sm font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: 'var(--c-muted)' }}>Valabil</Text>
            <View className="flex-row flex-wrap gap-2">
                {VALIDITY_OPTIONS.map((option) => {
                    const active = option.hours === validityHours;
                    return (
                        <Pressable
                            key={option.hours}
                            onPress={() => setValidityHours(option.hours)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            className="px-3.5 py-2 rounded-full border"
                            style={active
                                ? { backgroundColor: 'var(--c-surface-tint)', borderColor: 'var(--c-brand-border)' } as any
                                : { backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
                        >
                            <Text className="text-[13px] font-bold" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-muted)' }}>
                                {option.label}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>

            <Text className="text-sm font-bold uppercase tracking-wide mt-5 mb-2" style={{ color: 'var(--c-muted)' }}>Număr maxim de conturi</Text>
            <View className="flex-row items-center gap-3">
                <TextInput
                    value={maxUsesInput}
                    onChangeText={(value: string) => setMaxUsesInput(value.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    className="w-24 rounded-xl border px-3 py-2.5 text-[15px] font-bold outline-none"
                    style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', color: 'var(--c-ink-strong)' } as any}
                    accessibilityLabel="Număr maxim de conturi"
                />
                <Text className="text-[13px] flex-1" style={{ color: 'var(--c-faint)' }}>între 1 și 500</Text>
            </View>

            <Pressable
                onPress={() => void handleCreate()}
                disabled={creating}
                className={`mt-5 rounded-2xl py-3.5 min-h-[44px] items-center justify-center ${creating ? 'opacity-70' : ''}`}
                style={{ backgroundColor: 'var(--c-brand-surface)' } as any}
            >
                <Text className="font-bold" style={{ color: 'var(--c-on-brand)' }}>{creating ? 'Se generează…' : 'Generează cod'}</Text>
            </Pressable>

            {error ? (
                <View className="rounded-2xl border px-4 py-3 mt-4" style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' } as any}>
                    <Text className="font-medium" style={{ color: 'var(--c-danger-fg)' }}>{error}</Text>
                </View>
            ) : null}

            <View className="mt-6 gap-2.5">
                {loading ? (
                    <ActivityIndicator size="small" color="var(--c-brand-fg)" />
                ) : codes.length === 0 ? (
                    <Text className="text-[13px]" style={{ color: 'var(--c-faint)' }}>Niciun cod generat încă.</Text>
                ) : (
                    codes.map((item) => {
                        const meta = STATUS_META[item.status];
                        const isActive = item.status === 'active';
                        return (
                            <View
                                key={item.id}
                                className="rounded-xl border px-3.5 py-3"
                                style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)', opacity: isActive ? 1 : 0.7 } as any}
                            >
                                <View className="flex-row items-center gap-2">
                                    <Text
                                        className="text-[17px] font-black tracking-widest flex-1"
                                        style={{ color: 'var(--c-ink-strong)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } as any}
                                        selectable
                                    >
                                        {item.code}
                                    </Text>
                                    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: meta.bg }}>
                                        <Text className="text-[11px] font-black uppercase" style={{ color: meta.fg }}>{meta.label}</Text>
                                    </View>
                                </View>
                                <Text className="text-[12px] mt-1" style={{ color: 'var(--c-muted)' }}>
                                    {ROLE_LABELS[item.role]} · {item.useCount}/{item.maxUses} folosite · expiră {formatExpiry(item.expiresAt)}
                                </Text>
                                {isActive ? (
                                    <View className="flex-row gap-4 mt-2">
                                        <Pressable onPress={() => void handleCopy(item)} accessibilityRole="button">
                                            <Text className="text-[13px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>
                                                {copiedId === item.id ? 'Copiat' : 'Copiază'}
                                            </Text>
                                        </Pressable>
                                        <Pressable onPress={() => void handleRevoke(item.id)} accessibilityRole="button">
                                            <Text className="text-[13px] font-bold" style={{ color: 'var(--c-danger-fg)' }}>Revocă</Text>
                                        </Pressable>
                                    </View>
                                ) : null}
                            </View>
                        );
                    })
                )}
            </View>
        </GlassCard>
    );
}

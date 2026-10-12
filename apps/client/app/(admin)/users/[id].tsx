import { View, Text, TextInput, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { useCallback, useEffect, useState } from 'react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { usersApi, type AccountProfile, type User } from '../../../services/usersApi';
import { formatRelativeDate } from '../../../components/myclub/teamDisplay';
import { useResponsive } from '../../../hooks/useResponsive';
import GlassCard from '../../../components/ui/GlassCard';
import PageHero from '../../../components/admin/PageHero';
import Button from '../../../components/ui/Button';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import { LoadingState, ErrorState } from '../../../components/dashboard/ScreenStates';
import PageContainer from '../../../components/ui/PageContainer';

const ROLES: User['role'][] = ['superadmin', 'admin', 'coach', 'player', 'parent', 'accountant'];

const ROLE_LABEL: Record<string, string> = {
    coach: 'Antrenor',
    player: 'Jucător',
    parent: 'Părinte',
    admin: 'Administrator',
    superadmin: 'Superadmin',
    accountant: 'Contabil',
    staff: 'Staff',
};

const STATUS_VIEW: Record<string, { label: string; dot: string; fg: string }> = {
    active: { label: 'Activ', dot: 'var(--c-success)', fg: 'var(--c-success-fg)' },
    pending: { label: 'Așteaptă aprobarea', dot: 'var(--c-warning)', fg: 'var(--c-warning-fg)' },
    disabled: { label: 'Dezactivat', dot: 'var(--c-faint)', fg: 'var(--c-muted)' },
};

function formatDate(iso: string | null | undefined) {
    if (!iso) return '—';
    const date = new Date(iso.includes('T') || iso.endsWith('Z') ? iso : `${iso.replace(' ', 'T')}Z`);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
}

function SectionLabel({ children }: { children: string }) {
    return <Text className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--c-faint)' }}>{children}</Text>;
}

function DetailRow({ label, children, last = false }: { label: string; children: React.ReactNode; last?: boolean }) {
    return (
        <View
            className="flex-row items-center justify-between gap-4 py-2.5"
            style={{ borderBottomWidth: last ? 0 : 1, borderBottomColor: 'var(--c-border-soft)' } as any}
        >
            <Text className="text-[13px] font-semibold shrink-0" style={{ color: 'var(--c-muted)' }}>{label}</Text>
            <View className="flex-1 min-w-0 items-end">{children}</View>
        </View>
    );
}

function TeamChip({ id, name, onPress }: { id: number; name: string; onPress: (id: number) => void }) {
    return (
        <Pressable
            onPress={() => onPress(id)}
            accessibilityRole="button"
            accessibilityLabel={`Deschide echipa ${name}`}
            className="ui-press rounded-full px-2.5 py-1 border"
            style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
        >
            <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>{name}</Text>
        </Pressable>
    );
}

export default function UserDetail() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { isMobile } = useResponsive();
    const { toasts, showToast, dismissToast } = useToasts();
    const [user, setUser] = useState<AccountProfile | null>(null);
    const [name, setName] = useState('');
    const [role, setRole] = useState<User['role']>('coach');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const backTarget = '/admin/manage-accounts';

    const fetchUser = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setLoadError(null);
        try {
            const data = await usersApi.getUserById(String(id));
            setUser(data);
            setName(data.name);
            setRole(data.role);
        } catch (error) {
            console.error(error);
            setLoadError(error instanceof Error ? error.message : 'Nu am putut încărca utilizatorul.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await usersApi.updateUser(String(id), { name, role });
            showToast({ variant: 'success', message: 'Utilizatorul a fost actualizat.' });
            setUser((current) => (current ? { ...current, name, role } : current));
        } catch (error) {
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Salvarea a eșuat.' });
        } finally {
            setSaving(false);
        }
    };

    const statusView = STATUS_VIEW[user?.status ?? ''] ?? { label: user?.status ?? '—', dot: 'var(--c-faint)', fg: 'var(--c-muted)' };

    if (loading) {
        return (
            <PageContainer>
                <View className="w-full max-w-[720px]">
                    <LoadingState message="Se încarcă utilizatorul..." />
                </View>
            </PageContainer>
        );
    }

    if (loadError || !user) {
        return (
            <PageContainer>
                <View className="w-full max-w-[720px]">
                    <ErrorState title="Utilizator negăsit" message={loadError ?? undefined} onRetry={fetchUser} />
                </View>
            </PageContainer>
        );
    }

    return (
        <PageContainer className="pb-16">
          <View className="w-full max-w-[720px]">
            <View className="mb-3 self-start">
                <Button label="Înapoi" icon="arrow-back" size="sm" onPress={() => router.back(backTarget)} />
            </View>

            <PageHero
                eyebrow={ROLE_LABEL[user.role] ?? 'Cont'}
                title={user.name || user.email}
                subtitle={user.email}
                className="mb-4"
                leading={(
                    <View className="w-14 h-14 rounded-[16px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                        <Text className="f-display text-[20px] font-extrabold" style={{ color: 'var(--c-brand-strong)' }}>{(user.name || user.email || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                )}
            />

            <GlassCard className={`mb-4 ${isMobile ? 'p-4' : 'p-6'}`}>
                <SectionLabel>Detalii cont</SectionLabel>
                <DetailRow label="Rol">
                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{ROLE_LABEL[user.role] ?? user.role}</Text>
                </DetailRow>
                <DetailRow label="Status">
                    <View className="flex-row items-center gap-1.5">
                        <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusView.dot }} />
                        <Text className="text-[14px] font-semibold" style={{ color: statusView.fg }}>{statusView.label}</Text>
                    </View>
                </DetailRow>
                <DetailRow label="Email">
                    <Text className="text-[14px] font-semibold text-right" style={{ color: 'var(--c-ink)', overflowWrap: 'anywhere' } as any} selectable>{user.email}</Text>
                </DetailRow>
                <DetailRow label="Telefon">
                    {user.phone ? (
                        <a href={`tel:${user.phone}`} className="text-[14px] font-semibold no-underline" style={{ color: 'var(--c-brand-fg)' }}>{user.phone}</a>
                    ) : (
                        <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-faint)' }}>—</Text>
                    )}
                </DetailRow>
                <DetailRow label="Cont creat">
                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{formatDate(user.createdAt)}</Text>
                </DetailRow>
                <DetailRow label="Ultima autentificare" last>
                    <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }}>{user.lastLoginAt ? formatRelativeDate(user.lastLoginAt) : 'Niciodată'}</Text>
                </DetailRow>
            </GlassCard>

            {user.role === 'parent' ? (
                <GlassCard className={`mb-4 ${isMobile ? 'p-4' : 'p-6'}`}>
                    <SectionLabel>Familie</SectionLabel>
                    {user.family.length === 0 ? (
                        <Text className="text-[14px] font-medium leading-5" style={{ color: 'var(--c-muted)' }}>
                            Niciun copil legat de acest cont încă. Copiii apar aici după ce părintele își adaugă familia sau cererea de înscriere este aprobată.
                        </Text>
                    ) : (
                        <View>
                            {user.family.map((child, index) => (
                                <View
                                    key={child.id}
                                    className="py-3"
                                    style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: 'var(--c-border-soft)' } as any}
                                >
                                    <Pressable
                                        onPress={() => router.push(`/admin/player/${child.id}`)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Deschide fișa lui ${child.name}`}
                                        className="ui-press flex-row items-center gap-3"
                                    >
                                        <View className="w-9 h-9 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                                            <Text className="text-[12px] font-bold" style={{ color: 'var(--c-ink-soft)' }}>{(child.name || '?').charAt(0).toUpperCase()}</Text>
                                        </View>
                                        <View className="flex-1 min-w-0">
                                            <Text className="text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{child.name}</Text>
                                            <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
                                                {[child.birthYear ? `născut în ${child.birthYear}` : null, child.number != null ? `nr. ${child.number}` : null].filter(Boolean).join(' · ') || 'Fișa jucătorului'}
                                            </Text>
                                        </View>
                                        <MaterialIcons name="chevron-right" size={20} color="var(--c-faint)" />
                                    </Pressable>
                                    <View className="flex-row flex-wrap gap-1.5 mt-2.5 pl-12">
                                        {child.teams.length > 0
                                            ? child.teams.map((team) => <TeamChip key={team.id} id={team.id} name={team.name} onPress={(teamId) => router.push(`/admin/team/${teamId}`)} />)
                                            : <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>Fără echipă</Text>}
                                    </View>
                                    {child.parents.length > 0 ? (
                                        <View className="mt-2.5 pl-12 gap-1">
                                            {child.parents.map((parent) => (
                                                <Pressable
                                                    key={parent.id}
                                                    onPress={() => router.push(`/admin/users/${parent.id}`)}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`Deschide profilul lui ${parent.name}`}
                                                    className="ui-press flex-row items-center gap-1.5 self-start"
                                                >
                                                    <MaterialIcons name="family-restroom" size={15} color="var(--c-muted)" />
                                                    <Text className="text-[13px] font-medium" style={{ color: 'var(--c-ink-soft)' }} numberOfLines={1}>
                                                        Alt părinte: <Text className="font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{parent.name || parent.email}</Text>
                                                    </Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    )}
                </GlassCard>
            ) : null}

            {user.role === 'coach' || user.role === 'player' ? (
                <GlassCard className={`mb-4 ${isMobile ? 'p-4' : 'p-6'}`}>
                    <SectionLabel>{user.role === 'coach' ? 'Echipe antrenate' : 'Echipe'}</SectionLabel>
                    {user.teams.length === 0 ? (
                        <Text className="text-[14px] font-medium leading-5" style={{ color: 'var(--c-muted)' }}>
                            {user.role === 'coach' ? 'Nu antrenează nicio echipă încă.' : 'Nu este asociat vreunei echipe încă.'}
                        </Text>
                    ) : (
                        <View className="flex-row flex-wrap gap-1.5">
                            {user.teams.map((team) => <TeamChip key={team.id} id={team.id} name={team.name} onPress={(teamId) => router.push(`/admin/team/${teamId}`)} />)}
                        </View>
                    )}
                </GlassCard>
            ) : null}

            <GlassCard className={isMobile ? 'p-4' : 'p-6'}>
                <SectionLabel>Editează contul</SectionLabel>
                <View className="gap-5">
                    <View>
                        <Text className="text-[13px] font-semibold mb-2" style={{ color: 'var(--c-muted)' }}>Nume complet</Text>
                        <TextInput
                            className="border rounded-[12px] px-4 py-3 text-[15px] font-semibold outline-none"
                            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)', color: 'var(--c-ink)' } as any}
                            value={name}
                            onChangeText={setName}
                            placeholder="Nume și prenume"
                            placeholderTextColor="var(--c-faint)"
                        />
                    </View>

                    <View>
                        <Text className="text-[13px] font-semibold mb-2" style={{ color: 'var(--c-muted)' }}>Rol și permisiuni</Text>
                        <View className={`gap-3 ${isMobile ? '' : 'flex-row flex-wrap'}`}>
                            {ROLES.map((r) => {
                                const active = role === r;
                                return (
                                    <Pressable
                                        key={r}
                                        onPress={() => setRole(r)}
                                        className="min-h-[40px] px-3.5 py-2 rounded-[12px] border flex-row items-center"
                                        style={active
                                            ? { backgroundColor: 'var(--c-brand-surface)', borderColor: 'transparent' }
                                            : { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' }}
                                    >
                                        <View
                                            className="w-4 h-4 rounded-full border mr-2 items-center justify-center"
                                            style={{ borderColor: active ? 'var(--c-on-brand)' : 'var(--c-border-strong)' }}
                                        >
                                            {active && <View className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--c-on-brand)' }} />}
                                        </View>
                                        <Text className="font-black" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>
                                            {ROLE_LABEL[r] ?? r}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                </View>

                <View className={`pt-5 mt-5 border-t gap-3 ${isMobile ? '' : 'flex-row justify-end'}`} style={{ borderColor: 'var(--c-border-soft)' } as any}>
                    <Pressable
                        onPress={() => router.back(backTarget)}
                        className="min-h-[48px] px-6 py-3 rounded-2xl border items-center justify-center"
                        style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                    >
                        <Text className="font-black" style={{ color: 'var(--c-ink-soft)' }}>Anulează</Text>
                    </Pressable>
                    <Pressable
                        onPress={handleSave}
                        disabled={saving}
                        className={`min-h-[48px] px-8 py-3 rounded-2xl flex-row items-center justify-center ${saving ? 'opacity-70' : ''}`}
                        style={{ backgroundColor: 'var(--c-brand-surface)', boxShadow: 'var(--e-brand)' } as any}
                    >
                        {saving ? (
                            <ActivityIndicator color="var(--c-on-brand)" />
                        ) : (
                            <>
                                <MaterialIcons name="save" size={20} color="var(--c-on-brand)" style={{ marginRight: 8 }} />
                                <Text className="font-bold" style={{ color: 'var(--c-on-brand)' }}>Salvează</Text>
                            </>
                        )}
                    </Pressable>
                </View>
            </GlassCard>
          </View>

            <ToastHost toasts={toasts} onDismiss={dismissToast} />
        </PageContainer>
    );
}

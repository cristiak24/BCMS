import { View, Text, TextInput, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { useCallback, useEffect, useState } from 'react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { usersApi, User } from '../../../services/usersApi';
import { useResponsive } from '../../../hooks/useResponsive';
import GlassCard from '../../../components/ui/GlassCard';
import { ToastHost, useToasts } from '../../../components/ui/Toast';
import { LoadingState, ErrorState } from '../../../components/dashboard/ScreenStates';
import PageContainer from '../../../components/ui/PageContainer';

const ROLES: User['role'][] = ['superadmin', 'admin', 'coach', 'player', 'parent', 'accountant'];

export default function UserDetail() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { isMobile } = useResponsive();
    const { toasts, showToast, dismissToast } = useToasts();
    const [user, setUser] = useState<User | null>(null);
    const [name, setName] = useState('');
    const [role, setRole] = useState<User['role']>('coach');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

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
            router.back('/admin/users');
        } catch (error) {
            showToast({ variant: 'error', message: error instanceof Error ? error.message : 'Salvarea a eșuat.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <PageContainer>
                <View className="w-full max-w-[640px]">
                    <LoadingState message="Se încarcă utilizatorul..." />
                </View>
            </PageContainer>
        );
    }

    if (loadError || !user) {
        return (
            <PageContainer>
                <View className="w-full max-w-[640px]">
                    <ErrorState title="Utilizator negăsit" message={loadError ?? undefined} onRetry={fetchUser} />
                </View>
            </PageContainer>
        );
    }

    return (
        <PageContainer className="pb-16">
          <View className="w-full max-w-[640px]">
            <View className={`mb-6 ${isMobile ? 'gap-3' : 'flex-row items-center'}`}>
                <Pressable
                    onPress={() => router.back('/admin/users')}
                    className="mr-4 min-h-[44px] px-4 py-2 rounded-2xl border flex-row items-center self-start"
                    style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
                >
                    <MaterialIcons name="arrow-back" size={17} color="var(--c-brand-fg)" />
                    <Text className="ml-2 font-black" style={{ color: 'var(--c-ink-soft)' }}>Back</Text>
                </Pressable>
                <Text className={`${isMobile ? 'text-2xl' : 'text-3xl'} font-black`} style={{ color: 'var(--c-ink-strong)' }}>Edit User</Text>
            </View>

            <GlassCard className={isMobile ? 'p-5' : 'p-8'}>
                <View className={`mb-8 pb-6 border-b ${isMobile ? 'gap-3' : 'flex-row items-center'}`} style={{ borderColor: 'var(--c-border-soft)' } as any}>
                    <View className="w-16 h-16 rounded-3xl items-center justify-center mr-4" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                        <Text className="text-2xl font-black" style={{ color: 'var(--c-brand-strong)' }}>{user.name.charAt(0)}</Text>
                    </View>
                    <View>
                        <Text className="text-xl font-black" style={{ color: 'var(--c-ink-strong)' }}>{user.email}</Text>
                        <Text className="text-sm font-bold mt-0.5" style={{ color: 'var(--c-faint)' }}>User ID: #{user.id}</Text>
                    </View>
                </View>

                <View className="gap-6">
                    <View>
                        <Text className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--c-faint)' }}>Full Name</Text>
                        <TextInput
                            className="border rounded-2xl px-5 py-4 text-base font-bold outline-none"
                            style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)', color: 'var(--c-ink)' } as any}
                            value={name}
                            onChangeText={setName}
                            placeholder="Enter name"
                            placeholderTextColor="var(--c-faint)"
                        />
                    </View>

                    <View>
                        <Text className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--c-faint)' }}>Role Permissions</Text>
                        <View className={`gap-3 ${isMobile ? '' : 'flex-row flex-wrap'}`}>
                            {ROLES.map((r) => {
                                const active = role === r;
                                return (
                                    <Pressable
                                        key={r}
                                        onPress={() => setRole(r)}
                                        className="min-h-[44px] px-4 py-2 rounded-2xl border flex-row items-center"
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
                                        <Text className="font-black capitalize" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>
                                            {r}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                </View>

                <View className={`pt-8 mt-6 border-t gap-3 ${isMobile ? '' : 'flex-row justify-end'}`} style={{ borderColor: 'var(--c-border-soft)' } as any}>
                    <Pressable
                        onPress={() => router.back('/admin/users')}
                        className="min-h-[48px] px-6 py-3 rounded-2xl border items-center justify-center"
                        style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface)' } as any}
                    >
                        <Text className="font-black" style={{ color: 'var(--c-ink-soft)' }}>Cancel</Text>
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
                                <Text className="font-bold" style={{ color: 'var(--c-on-brand)' }}>Save Changes</Text>
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

import { View, Text, TextInput, Pressable, ActivityIndicator } from '@/src/web/reactNative';
import { useLocalSearchParams, useRouter } from '@/src/web/expoRouter';
import { useCallback, useEffect, useState } from 'react';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { usersApi, User } from '../../../services/usersApi';
import { useResponsive } from '../../../hooks/useResponsive';
import GlassCard from '../../../components/ui/GlassCard';
import PageHero from '../../../components/admin/PageHero';
import Button from '../../../components/ui/Button';
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
            <View className="mb-3 self-start">
                <Button label="Înapoi" icon="arrow-back" size="sm" onPress={() => router.back('/admin/users')} />
            </View>

            <PageHero
                eyebrow="Utilizator"
                title="Editează utilizatorul"
                subtitle={user.email}
                className="mb-4"
                leading={(
                    <View className="w-14 h-14 rounded-[16px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                        <Text className="f-display text-[20px] font-extrabold" style={{ color: 'var(--c-brand-strong)' }}>{(user.name || user.email || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                )}
            />

            <GlassCard className={isMobile ? 'p-4' : 'p-6'}>
                <View className="gap-5">
                    <View>
                        <Text className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--c-faint)' }}>Nume complet</Text>
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
                        <Text className="text-[11px] font-black uppercase tracking-widest mb-3" style={{ color: 'var(--c-faint)' }}>Rol și permisiuni</Text>
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
                                        <Text className="font-black capitalize" style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>
                                            {r}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                </View>

                <View className={`pt-5 mt-5 border-t gap-3 ${isMobile ? '' : 'flex-row justify-end'}`} style={{ borderColor: 'var(--c-border-soft)' } as any}>
                    <Pressable
                        onPress={() => router.back('/admin/users')}
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

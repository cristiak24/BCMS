import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { useSafeAreaInsets } from '@/src/web/safeArea';
import { getHomeRouteForRole, updateAuthSession, type AuthUser } from '../../utils/authSession';
import { profileApi, type ProfileRecord } from '../../services/profileApi';
import { useResponsive } from '../../hooks/useResponsive';
import ProfileImagePicker from './ProfileImagePicker';
import ProfileForm from './ProfileForm';
import PasswordChangeForm from './PasswordChangeForm';
import { useFirebaseAuth } from '../../context/AuthContext';
import { useTheme, type ThemeMode } from '../../context/ThemeContext';
import PageContainer from '../ui/PageContainer';
import PageHeader from '../ui/PageHeader';
import GlassCard from '../ui/GlassCard';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/ScreenState';

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Luminos', icon: 'wb-sunny' },
  { mode: 'dark', label: 'Întunecat', icon: 'nightlight' },
  { mode: 'system', label: 'Sistem', icon: 'settings' },
];

function AppearanceCard() {
  const { mode, setMode } = useTheme();
  return (
    <GlassCard>
      <Text className="text-[10px] font-semibold uppercase tracking-[0.09em] mb-1" style={{ color: 'var(--c-muted)' }}>
        Aspect
      </Text>
      <Text className="text-[13px] font-medium mb-3" style={{ color: 'var(--c-faint)' }}>
        Alege cum arată BCMS pe acest dispozitiv.
      </Text>
      <View className="flex-row gap-2">
        {THEME_OPTIONS.map((opt) => {
          const active = mode === opt.mode;
          return (
            <Pressable
              key={opt.mode}
              onPress={() => setMode(opt.mode)}
              accessibilityRole="button"
              accessibilityLabel={`Folosește tema ${opt.label}`}
              accessibilityState={{ selected: active }}
              className="flex-1 items-center justify-center rounded-[12px] px-3 py-3 border"
              style={
                active
                  ? ({ backgroundColor: 'var(--c-brand-surface)', borderColor: 'transparent' } as any)
                  : ({ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any)
              }
            >
              <MaterialIcons name={opt.icon} size={18} color={active ? 'var(--c-on-brand)' : 'var(--c-muted)'} />
              <Text
                className="text-[12px] font-semibold mt-1.5"
                style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GlassCard>
  );
}

function sessionToProfile(session: AuthUser): ProfileRecord {
  const fullName = [session.firstName, session.lastName].filter(Boolean).join(' ').trim() || session.name;

  return {
    ...session,
    fullName,
    clubName: session.clubName ?? null,
    teamName: session.teamName ?? null,
    createdAt: session.createdAt ?? null,
    lastLoginAt: session.lastLoginAt ?? null,
  };
}

function formatDate(value?: string | null) {
  if (!value) {
    return 'Indisponibil';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('ro-RO', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getInitials(profile?: ProfileRecord | null) {
  const first = profile?.firstName?.trim()?.[0] ?? profile?.name?.trim()?.[0] ?? 'U';
  const last = profile?.lastName?.trim()?.[0] ?? '';
  return `${first}${last}`.toUpperCase();
}

type ProfileScreenProps = {
  showBackButton?: boolean;
};

export default function ProfileScreen({ showBackButton = true }: ProfileScreenProps) {
  const router = useRouter();
  const { isMobile, isDesktop } = useResponsive();
  const insets = useSafeAreaInsets();
  const { initializing, session: authSession, signOut } = useFirebaseAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [session, setSession] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      if (initializing) {
        return;
      }

      if (!authSession) {
        router.replace('/login');
        return;
      }

      setSession(authSession);
      setProfile(sessionToProfile(authSession));

      try {
        setLoading(true);
        const data = await profileApi.getProfile();
        if (!active) {
          return;
        }

        setProfile(data);
        setError(null);
        await updateAuthSession({
          name: data.fullName || data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          avatarUrl: data.avatarUrl,
          clubName: data.clubName,
          teamName: data.teamName,
          phone: data.phone,
          preferredLanguage: data.preferredLanguage,
          notificationPreferences: data.notificationPreferences,
          createdAt: data.createdAt,
          lastLoginAt: data.lastLoginAt,
        });
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : 'Nu s-a putut încărca profilul.');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [authSession, initializing, router]);

  const headerSubtitle = useMemo(() => {
    if (!profile) {
      return '';
    }

    return [profile.clubName, profile.teamName].filter(Boolean).join(' • ');
  }, [profile]);

  const handleRefresh = async () => {
      try {
        setLoading(true);
        const data = await profileApi.getProfile();
        setProfile(data);
        setError(null);
      } catch (refreshError) {
        setError(refreshError instanceof Error ? refreshError.message : 'Nu s-a putut reîmprospăta profilul.');
      } finally {
        setLoading(false);
      }
  };

  const handleSaveProfile = async (payload: Parameters<typeof profileApi.updateProfile>[0]) => {
    const updated = await profileApi.updateProfile(payload);
    setProfile(updated);
    await updateAuthSession({
      name: updated.fullName || updated.name,
      firstName: updated.firstName,
      lastName: updated.lastName,
      avatarUrl: updated.avatarUrl,
      phone: updated.phone,
      preferredLanguage: updated.preferredLanguage,
      notificationPreferences: updated.notificationPreferences,
      clubName: updated.clubName,
      teamName: updated.teamName,
    });
    return updated;
  };

  const handlePasswordChange = async (payload: Parameters<typeof profileApi.changePassword>[0]) => {
    const response = await profileApi.changePassword(payload);
    if (!response.success) {
      throw new Error(response.message || 'Nu s-a putut actualiza parola.');
    }
  };

  const handleAvatarUploaded = async (avatarUrl: string) => {
    if (!profile) {
      return;
    }

    const nextProfile = { ...profile, avatarUrl };
    setProfile(nextProfile);
    await updateAuthSession({ avatarUrl });
  };

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  // Skeleton mirrors the real grid (header band + 7/5 split) so the page does
  // not reflow when data lands — the old full-screen spinner threw the layout
  // away and rebuilt it.
  if (loading && !profile) {
    return (
      <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
        <PageContainer>
          <Skeleton className="h-9 w-56 rounded-[10px] mb-4" />
          <Skeleton className="h-[132px] w-full rounded-[16px] mb-4" />
          <View className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <View className="lg:col-span-7">
              <Skeleton className="h-[420px] w-full rounded-[16px]" />
            </View>
            <View className="lg:col-span-5 gap-4">
              <Skeleton className="h-[150px] w-full rounded-[16px]" />
              <Skeleton className="h-[210px] w-full rounded-[16px]" />
            </View>
          </View>
        </PageContainer>
      </View>
    );
  }

  if (error && !profile) {
    return (
      <View className="flex-1" style={{ backgroundColor: 'var(--c-bg)' }}>
        <PageContainer>
          <PageHeader title="Profil" subtitle="Contul tău și datele personale." />
          <ErrorState
            title="Profil indisponibil"
            message={error}
            actionLabel="Reîncearcă"
            onAction={handleRefresh}
          />
        </PageContainer>
      </View>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <ScrollView
      className="flex-1 bg-[var(--c-bg)]"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 28, 40) }}
      showsVerticalScrollIndicator={false}
    >
        <PageContainer
          className="pb-4"
          style={isMobile ? { paddingTop: Math.max(insets.top + 18, 42) } : undefined}
        >
        {/* The title now renders on BOTH routes. Previously `showBackButton`
            swapped the title out for the back button, so `/profile` (which
            passes showBackButton) had no page title at all. The back button is
            still route-conditional — only its exclusivity with the title is
            gone. */}
        <PageHeader
          title="Profil"
          subtitle="Contul tău și datele personale."
          actions={
            <>
              {showBackButton ? (
                <Pressable
                  onPress={() => router.back()}
                  className="h-9 px-3 flex-row items-center gap-1.5 rounded-[10px] border"
                  style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
                  accessibilityRole="button"
                  accessibilityLabel="Înapoi"
                >
                  <MaterialIcons name="arrow-back" size={16} color="var(--c-ink-soft)" />
                  <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Înapoi</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={handleLogout}
                className="h-9 px-3 flex-row items-center gap-1.5 rounded-[10px]"
                style={{ backgroundColor: 'var(--c-brand-surface)' }}
                accessibilityRole="button"
                accessibilityLabel="Deconectare"
              >
                <MaterialIcons name="logout" size={16} color="var(--c-on-brand)" />
                <Text className="text-[12px] font-semibold" style={{ color: 'var(--c-on-brand)' }}>
                  {isMobile ? 'Ieși' : 'Deconectare'}
                </Text>
              </Pressable>
            </>
          }
        />

        <View
          className="rounded-[16px] border overflow-hidden mb-4"
          style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
          {/* Slim brand accent strip instead of the old 96px empty navy band. */}
          <View className="h-2" style={{ backgroundColor: 'var(--c-brand-surface)' }} />
          <View className="px-5 md:px-6 py-5">
            <View className={`${isMobile ? 'items-start' : 'flex-row items-center justify-between'} gap-4`}>
              <View className={`${isMobile ? 'items-start' : 'flex-row items-center'} gap-4 min-w-0`}>
                <ProfileImagePicker
                  avatarUrl={profile.avatarUrl}
                  initials={getInitials(profile)}
                  onUploaded={handleAvatarUploaded}
                  onError={(message) => Alert.alert('Încărcare avatar', message)}
                />
                <View className="min-w-0">
                  <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
                    <View className="px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                      <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--c-brand-fg)' }}>{profile.role}</Text>
                    </View>
                    <View className="px-2.5 py-0.5 rounded-full" style={{ backgroundColor: 'var(--c-success-bg)' }}>
                      <Text className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--c-success-fg)' }}>{profile.status}</Text>
                    </View>
                  </View>
                  <Text className={`${isMobile ? 'text-2xl' : 'text-[26px]'} font-bold leading-tight`} style={{ color: 'var(--c-ink-strong)' }} numberOfLines={2}>
                    {profile.fullName || profile.name}
                  </Text>
                  {/* break-anywhere: long emails must wrap, not clip. This was the
                      profile "email cut off" bug — numberOfLines={1} truncated it. */}
                  <Text className="text-[14px] font-medium mt-0.5 break-anywhere" style={{ color: 'var(--c-muted)' }}>
                    {profile.email}
                  </Text>
                  {headerSubtitle ? (
                    <Text className="text-[13px] mt-0.5" style={{ color: 'var(--c-faint)' }}>
                      {headerSubtitle}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View className={`flex-row gap-2 ${isMobile ? 'w-full' : ''}`}>
                <View className={`${isMobile ? 'flex-1' : ''} rounded-[12px] border px-3.5 py-2.5`} style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
                  <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Membru din</Text>
                  <Text className="font-semibold mt-0.5 text-[13px]" style={{ color: 'var(--c-ink)' }}>{formatDate(profile.createdAt)}</Text>
                </View>
                <View className={`${isMobile ? 'flex-1' : ''} rounded-[12px] border px-3.5 py-2.5`} style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
                  <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>Ultima logare</Text>
                  <Text className="font-semibold mt-0.5 text-[13px]" style={{ color: 'var(--c-ink)' }}>{formatDate(profile.lastLoginAt)}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* 7/5 rather than the old 50/50 `flex-1` pair. The left column holds a
            dense multi-field form; the right holds three short blocks. Equal
            halves gave the form the same width as a three-button theme picker,
            which is why the inputs looked cramped while the rail sat half
            empty. Collapses to one column below lg. */}
        <View className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-8">
          <View className="lg:col-span-7 min-w-0">
            <ProfileForm profile={profile} onSave={handleSaveProfile} />
          </View>

          <View className="lg:col-span-5 min-w-0 gap-4">
            <AppearanceCard />
            <PasswordChangeForm onChangePassword={handlePasswordChange} />

            {/* Account Details — only the fields NOT already shown in the header
                (which carries name, email, role, status, member-since, last
                login). Repeating all seven was the "we don't use the whole
                page" bloat; this keeps just the workspace context. */}
            <GlassCard>
              <Text className="text-[10px] font-semibold uppercase tracking-[0.09em] mb-2.5" style={{ color: 'var(--c-muted)' }}>Cont</Text>
              <View className="flex-row flex-wrap gap-2.5">
                {[
                  { label: 'Email', value: profile.email },
                  { label: 'Club', value: profile.clubName ?? 'Neatribuit' },
                  { label: 'Echipă', value: profile.teamName ?? 'Neatribuit' },
                ].map((item) => (
                  <View key={item.label} className="min-w-[150px] flex-1 rounded-[12px] px-3.5 py-2.5 border" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' }}>
                    <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>{item.label}</Text>
                    <Text className="font-medium mt-0.5 text-[13px] break-anywhere" style={{ color: 'var(--c-ink)' }}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          </View>
        </View>
      </PageContainer>
    </ScrollView>
  );
}

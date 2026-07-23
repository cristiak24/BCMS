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

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Light', icon: 'wb-sunny' },
  { mode: 'dark', label: 'Dark', icon: 'nightlight' },
  { mode: 'system', label: 'System', icon: 'settings' },
];

function AppearanceCard() {
  const { mode, setMode } = useTheme();
  return (
    <View className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
      <Text className="text-[#0E2041] text-[12px] font-black uppercase tracking-widest mb-1">Appearance</Text>
      <Text className="text-[#64748B] text-sm font-semibold mb-4">Choose how BCMS looks on this device.</Text>
      <View className="flex-row gap-2">
        {THEME_OPTIONS.map((opt) => {
          const active = mode === opt.mode;
          return (
            <Pressable
              key={opt.mode}
              onPress={() => setMode(opt.mode)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${opt.label} theme`}
              className={`flex-1 items-center justify-center rounded-2xl px-3 py-4 border ${active ? 'bg-[#1D3E90] border-[#1D3E90]' : 'bg-[#F8FAFC] border-slate-100'}`}
            >
              <MaterialIcons name={opt.icon} size={22} color={active ? '#FFFFFF' : 'var(--c-muted)'} />
              <Text className={`text-[12px] font-black mt-2 ${active ? 'text-white' : 'text-[#64748B]'}`}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
    return 'Not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en', {
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

        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load profile.');
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
        setError(refreshError instanceof Error ? refreshError.message : 'Failed to refresh profile.');
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
      throw new Error(response.message || 'Failed to update password.');
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

  if (loading && !profile) {
    return (
      <View className="flex-1 items-center justify-center bg-[#F1F5F9]">
        <ActivityIndicator size="large" color="var(--c-brand-fg)" />
      </View>
    );
  }

  if (error && !profile) {
    return (
      <View className="flex-1 bg-[#F1F5F9] items-center justify-center px-6">
        <View className="w-full max-w-xl bg-white rounded-[28px] p-6 border border-red-100 shadow-sm">
          <Text className="text-[#0E2041] text-2xl font-black">Profile unavailable</Text>
          <Text className="text-slate-500 mt-2">{error}</Text>
          <View className="mt-6 flex-row gap-3">
            <Pressable onPress={handleRefresh} className="bg-[#1D3E90] rounded-2xl px-5 py-3">
              <Text className="text-white font-bold">Try Again</Text>
            </Pressable>
            <Pressable onPress={() => router.replace(getHomeRouteForRole(session?.role ?? 'admin'))} className="bg-white rounded-2xl px-5 py-3 border border-slate-200">
              <Text className="text-[#0E2041] font-bold">Go Home</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <ScrollView
      className="flex-1 bg-[#F1F5F9]"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 28, 40) }}
      showsVerticalScrollIndicator={false}
    >
        <View
          className="max-w-6xl mx-auto w-full px-4 md:px-8 pb-4 md:py-8"
          style={isMobile ? { paddingTop: Math.max(insets.top + 18, 42) } : undefined}
        >
        <View className="flex-row items-center justify-between mb-5 gap-3">
          {showBackButton ? (
            <Pressable
              onPress={() => router.back()}
              className={`${isMobile ? 'w-12 h-12 justify-center' : 'px-4 py-3'} flex-row items-center bg-white border border-slate-200 rounded-2xl shadow-sm`}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <MaterialIcons name="arrow-back" size={isMobile ? 22 : 18} color="var(--c-ink)" />
              {!isMobile ? <Text className="ml-2 text-[#0E2041] font-bold">Back</Text> : null}
            </Pressable>
          ) : (
            <View className="flex-1">
              <Text className="text-[#0E2041] text-3xl md:text-4xl font-black tracking-tight">Profile</Text>
              <Text className="text-[#64748B] text-sm md:text-base font-semibold mt-2">Your account and personal details.</Text>
            </View>
          )}

          <Pressable
            onPress={handleLogout}
            className={`${isMobile ? 'h-12 px-4' : 'px-4 py-3'} flex-row items-center bg-[#0E2041] rounded-2xl shadow-sm`}
            accessibilityRole="button"
            accessibilityLabel="Logout"
          >
            <MaterialIcons name="logout" size={18} color="#ffffff" />
            <Text className="ml-2 text-white font-black uppercase tracking-widest text-[11px]">
              {isMobile ? 'Exit' : 'Logout'}
            </Text>
          </Pressable>
        </View>

        <View className="bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden mb-6">
          <View className="h-24 bg-[#1D3E90]" />
          <View className="px-6 pb-6 pt-6">
            <View className={`${isMobile ? 'items-start' : 'flex-row items-end justify-between'} gap-4`}>
              <View className="flex-row items-end gap-4 pt-6">
                <View className="-mt-12">
                <ProfileImagePicker
                  avatarUrl={profile.avatarUrl}
                  initials={getInitials(profile)}
                  onUploaded={handleAvatarUploaded}
                  onError={(message) => Alert.alert('Avatar upload', message)}
                />
                </View>
                <View className="pb-1">
                  <View className="flex-row items-center gap-2 mb-2 flex-wrap">
                    <View className="bg-[#EBF1FF] px-3 py-1 rounded-full">
                      <Text className="text-[#1D3E90] text-[10px] font-black uppercase tracking-widest">{profile.role}</Text>
                    </View>
                    <View className="bg-emerald-50 px-3 py-1 rounded-full">
                      <Text className="text-emerald-700 text-[10px] font-black uppercase tracking-widest">{profile.status}</Text>
                    </View>
                  </View>
                  <Text className={`text-[#0E2041] ${isMobile ? 'text-2xl' : 'text-3xl'} font-black leading-tight`} numberOfLines={2}>
                    {profile.fullName || profile.name}
                  </Text>
                  <Text className="text-slate-500 font-semibold mt-1" numberOfLines={1}>
                    {profile.email}
                  </Text>
                  <Text className="text-slate-400 text-sm mt-1">
                    {headerSubtitle || 'No club or team assigned'}
                  </Text>
                </View>
              </View>

              <View className="bg-[#F8FAFC] rounded-3xl border border-slate-100 px-4 py-3">
                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">Member since</Text>
                <Text className="text-[#0E2041] font-bold mt-1">{formatDate(profile.createdAt)}</Text>
                <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3">Last login</Text>
                <Text className="text-[#0E2041] font-bold mt-1">{formatDate(profile.lastLoginAt)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View className={`${isDesktop ? 'flex-row items-start' : ''} gap-6 mb-10`}>
          <View className={isDesktop ? 'flex-1' : undefined}>
            <ProfileForm profile={profile} onSave={handleSaveProfile} />
          </View>

          <View className={`gap-6 ${isDesktop ? 'flex-1' : ''}`}>
            <AppearanceCard />
            <PasswordChangeForm onChangePassword={handlePasswordChange} />

            <View className="bg-white rounded-[28px] p-6 border border-slate-100 shadow-sm">
              <Text className="text-[#0E2041] text-[12px] font-black uppercase tracking-widest mb-4">Account Details</Text>
              <View className="flex-row flex-wrap gap-3">
                {[
                  { label: 'Email', value: profile.email },
                  { label: 'Role', value: profile.role },
                  { label: 'Club', value: profile.clubName ?? 'Not assigned' },
                  { label: 'Team', value: profile.teamName ?? 'Not assigned' },
                  { label: 'Status', value: profile.status },
                  { label: 'Member since', value: formatDate(profile.createdAt) },
                  { label: 'Last login', value: formatDate(profile.lastLoginAt) },
                ].map((item) => (
                  <View key={item.label} className="min-w-[150px] flex-1 bg-[#F8FAFC] rounded-2xl px-4 py-3 border border-slate-100">
                    <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">{item.label}</Text>
                    <Text className="text-[#0E2041] font-semibold mt-1" numberOfLines={2}>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

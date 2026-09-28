import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { useRouter } from '@/src/web/expoRouter';
import { useSafeAreaInsets } from '@/src/web/safeArea';
import { updateAuthSession, type AuthUser } from '../../utils/authSession';
import { profileApi, type ProfileRecord } from '../../services/profileApi';
import { useResponsive } from '../../hooks/useResponsive';
import ProfileImagePicker from './ProfileImagePicker';
import ProfileForm from './ProfileForm';
import PasswordChangeForm from './PasswordChangeForm';
import { useSession } from '../../context/AuthContext';
import { useTheme, type ThemeMode } from '../../context/ThemeContext';
import PageContainer from '../ui/PageContainer';
import PageHeader from '../ui/PageHeader';
import { Skeleton } from '../ui/Skeleton';
import { ErrorState } from '../ui/ScreenState';
import { ProfileCard } from './ProfileParts';

const THEME_OPTIONS: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Luminos', icon: 'wb-sunny' },
  { mode: 'dark', label: 'Întunecat', icon: 'nightlight' },
  { mode: 'system', label: 'Sistem', icon: 'settings-brightness' },
];

/**
 * Miniature of the app in each theme. Hard-coded colours on purpose: the
 * preview has to show what the OTHER theme looks like, so it can't use the
 * live tokens (which only ever reflect the current one).
 */
function ThemePreview({ mode }: { mode: ThemeMode }) {
  const pane = (dark: boolean) => (
    <View className="flex-1 h-full p-1.5 gap-1" style={{ backgroundColor: dark ? '#0A0B11' : '#F4F5F8' }}>
      <View className="h-2 w-2/3 rounded-[3px]" style={{ backgroundColor: dark ? '#262A3A' : '#DADDE7' }} />
      <View className="flex-1 rounded-[4px] p-1 gap-1" style={{ backgroundColor: dark ? '#151722' : '#FFFFFF' }}>
        <View className="h-1.5 w-1/2 rounded-full" style={{ backgroundColor: '#5B54EB' }} />
        <View className="h-1.5 w-3/4 rounded-full" style={{ backgroundColor: dark ? '#2A2E3E' : '#E2E4EC' }} />
      </View>
    </View>
  );

  return (
    <View className="h-16 w-full rounded-[10px] overflow-hidden flex-row border" style={{ borderColor: 'var(--c-border)' } as any}>
      {mode === 'system' ? (
        <>
          {pane(false)}
          {pane(true)}
        </>
      ) : pane(mode === 'dark')}
    </View>
  );
}

function AppearanceCard() {
  const { mode, setMode } = useTheme();
  return (
    <ProfileCard icon="palette" tone="purple" title="Aspect" description="Alege cum arată BCMS pe acest dispozitiv.">
      <View className="flex-row gap-2.5" accessibilityRole="radiogroup" accessibilityLabel="Temă">
        {THEME_OPTIONS.map((opt) => {
          const active = mode === opt.mode;
          return (
            <Pressable
              key={opt.mode}
              onPress={() => setMode(opt.mode)}
              accessibilityRole="radio"
              accessibilityLabel={`Folosește tema ${opt.label}`}
              accessibilityState={{ selected: active }}
              className="ui-press flex-1 rounded-[12px] p-2 border gap-2 text-left"
              style={{
                backgroundColor: active ? 'var(--c-surface-tint)' : 'var(--c-surface-2)',
                borderColor: active ? 'var(--c-brand-border)' : 'var(--c-border)',
                boxShadow: active ? '0 0 0 1px var(--c-brand-border)' : 'none',
              } as any}
            >
              <ThemePreview mode={opt.mode} />
              <View className="flex-row items-center justify-center gap-1.5 pb-0.5">
                <MaterialIcons name={opt.icon} size={15} color={active ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
                <Text className="text-[12.5px] font-semibold" style={{ color: active ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)' }}>
                  {opt.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </ProfileCard>
  );
}

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super admin',
  admin: 'Administrator',
  coach: 'Antrenor',
  player: 'Jucător',
  parent: 'Părinte',
  staff: 'Staff',
  accountant: 'Contabil',
};

const STATUS_META: Record<string, { label: string; fg: string; bg: string }> = {
  active: { label: 'Activ', fg: 'var(--c-success-fg)', bg: 'var(--c-success-bg)' },
  pending: { label: 'În așteptare', fg: 'var(--c-warning-fg)', bg: 'var(--c-warning-bg)' },
  disabled: { label: 'Dezactivat', fg: 'var(--c-danger-fg)', bg: 'var(--c-danger-bg)' },
};

/** What's still missing from the profile, in the order worth fixing. */
function getProfileCompletion(profile: ProfileRecord) {
  const checks = [
    { done: Boolean(profile.firstName?.trim() && profile.lastName?.trim()), label: 'nume complet' },
    { done: Boolean(profile.avatarUrl), label: 'fotografie' },
    { done: Boolean(profile.phone?.trim()), label: 'telefon' },
    { done: Boolean(profile.preferredLanguage?.trim()), label: 'limbă' },
  ];
  const done = checks.filter((check) => check.done).length;
  return {
    percent: Math.round((done / checks.length) * 100),
    missing: checks.filter((check) => !check.done).map((check) => check.label),
  };
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View className="w-8 h-8 rounded-[9px] items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-2)' }}>
        <MaterialIcons name={icon} size={16} color="var(--c-muted)" />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>{label}</Text>
        <Text className="text-[14px] font-semibold mt-0.5 break-anywhere" style={{ color: 'var(--c-ink)' }}>{value}</Text>
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
  const { isMobile } = useResponsive();
  const insets = useSafeAreaInsets();
  const { initializing, session: authSession, signOut } = useSession();
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
          <Skeleton className="h-[230px] w-full rounded-[18px] mb-4" />
          <View className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <View className="lg:col-span-7 2xl:col-span-8 gap-4">
              <Skeleton className="h-[260px] w-full rounded-[16px]" />
              <Skeleton className="h-[280px] w-full rounded-[16px]" />
            </View>
            <View className="lg:col-span-5 2xl:col-span-4 gap-4">
              <Skeleton className="h-[190px] w-full rounded-[16px]" />
              <Skeleton className="h-[260px] w-full rounded-[16px]" />
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
          <PageHeader title="Profilul meu" subtitle="Datele contului, preferințele și securitatea." />
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

  const roleLabel = ROLE_LABELS[String(profile.role ?? '').toLowerCase()] ?? profile.role;
  const statusMeta = STATUS_META[String(profile.status ?? '').toLowerCase()] ?? {
    label: profile.status ?? '—',
    fg: 'var(--c-muted)',
    bg: 'var(--c-surface-3)',
  };
  const completion = getProfileCompletion(profile);

  return (
    <ScrollView
      className="flex-1 bg-[var(--c-bg)]"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 28, 40) }}
      showsVerticalScrollIndicator={false}
    >
      <PageContainer
        className="pb-4"
        style={isMobile && showBackButton ? { paddingTop: Math.max(insets.top + 18, 42) } : undefined}
      >
        {/* The title renders on BOTH routes (/profile and the in-shell
            /account). Only the back button is route-conditional. Sign-out moved
            out of the header into its own "Sesiune" card: a filled brand button
            next to the page title read as the page's primary action. */}
        <PageHeader
          title="Profilul meu"
          subtitle="Datele contului, preferințele și securitatea."
          actions={showBackButton ? (
            <Pressable
              onPress={() => router.back()}
              className="ui-press h-9 px-3 flex-row items-center gap-1.5 rounded-[10px] border"
              style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
              accessibilityRole="button"
              accessibilityLabel="Înapoi"
            >
              <MaterialIcons name="arrow-back" size={16} color="var(--c-ink-soft)" />
              <Text className="text-[12.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>Înapoi</Text>
            </Pressable>
          ) : undefined}
        />

        {/* ── Identity ───────────────────────────────────────────── */}
        <View
          className="ui-rise rounded-[18px] border overflow-hidden mb-4"
          style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
        >
          <View
            className="ui-hero-sheen h-[88px] md:h-[104px]"
            style={{ backgroundColor: 'var(--c-hero-via)', background: 'linear-gradient(120deg, var(--c-hero-from), var(--c-hero-via) 55%, var(--c-hero-to))' } as any}
          />

          <View className="px-5 md:px-6 pb-5 -mt-12 md:-mt-14">
            {/* Only the avatar overlaps the cover band; the text starts below it
                (lg:mt) so dark ink never lands on the indigo gradient. */}
            <View className="flex-col lg:flex-row lg:items-start gap-4 lg:gap-6">
              <ProfileImagePicker
                avatarUrl={profile.avatarUrl}
                initials={getInitials(profile)}
                onUploaded={handleAvatarUploaded}
                onError={(message) => Alert.alert('Încărcare avatar', message)}
              />

              <View className="flex-1 min-w-0 lg:mt-[64px]">
                <View className="flex-row items-center gap-2 mb-1.5 flex-wrap">
                  <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
                    <MaterialIcons name="badge" size={12} color="var(--c-brand-fg)" />
                    <Text className="text-[11.5px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{roleLabel}</Text>
                  </View>
                  <View className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ backgroundColor: statusMeta.bg }}>
                    <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusMeta.fg }} />
                    <Text className="text-[11.5px] font-bold" style={{ color: statusMeta.fg }}>{statusMeta.label}</Text>
                  </View>
                </View>
                <Text
                  className="text-[24px] md:text-[28px] font-bold leading-tight"
                  style={{ color: 'var(--c-ink-strong)', letterSpacing: '-0.5px' } as any}
                  numberOfLines={2}
                >
                  {profile.fullName || profile.name}
                </Text>
                <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                  {/* break-anywhere: long emails must wrap, not clip. */}
                  <View className="flex-row items-center gap-1.5 min-w-0 max-w-full">
                    <MaterialIcons name="mail" size={14} color="var(--c-faint)" />
                    <Text className="text-[13.5px] font-medium break-anywhere" style={{ color: 'var(--c-muted)' }}>{profile.email}</Text>
                  </View>
                  {headerSubtitle ? (
                    <View className="flex-row items-center gap-1.5 min-w-0">
                      <MaterialIcons name="groups" size={14} color="var(--c-faint)" />
                      <Text className="text-[13.5px] font-medium" style={{ color: 'var(--c-muted)' }}>{headerSubtitle}</Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View className="grid grid-cols-2 lg:flex lg:flex-row gap-2.5 lg:mt-[68px] shrink-0">
                <View className="rounded-[12px] border px-3.5 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
                  <Text className="text-[11.5px] font-medium" style={{ color: 'var(--c-faint)' }}>Membru din</Text>
                  <Text className="font-semibold mt-0.5 text-[13.5px]" style={{ color: 'var(--c-ink)' }}>{formatDate(profile.createdAt)}</Text>
                </View>
                <View className="rounded-[12px] border px-3.5 py-2.5" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}>
                  <Text className="text-[11.5px] font-medium" style={{ color: 'var(--c-faint)' }}>Ultima autentificare</Text>
                  <Text className="font-semibold mt-0.5 text-[13.5px]" style={{ color: 'var(--c-ink)' }}>{formatDate(profile.lastLoginAt)}</Text>
                </View>
              </View>
            </View>

            {/* Completion meter — only while something is actually missing. */}
            {completion.percent < 100 ? (
              <View
                className="mt-5 rounded-[12px] border px-4 py-3 flex-col sm:flex-row sm:items-center gap-3"
                style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border-soft)' } as any}
              >
                <View className="flex-1 min-w-0">
                  <View className="flex-row items-center justify-between gap-3">
                    <Text className="text-[13px] font-semibold" style={{ color: 'var(--c-ink)' }}>Profil completat</Text>
                    <Text className="t-num text-[13px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{completion.percent}%</Text>
                  </View>
                  <View className="h-1.5 rounded-full overflow-hidden mt-2" style={{ backgroundColor: 'var(--c-surface-3)' }}>
                    <View className="ui-bar h-full rounded-full" style={{ width: `${completion.percent}%`, background: 'linear-gradient(90deg, var(--c-hero-to), var(--c-sky))' } as any} />
                  </View>
                </View>
                <Text className="t-meta sm:max-w-[260px]" style={{ color: 'var(--c-muted)' }}>
                  Mai adaugă: {completion.missing.join(', ')}.
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {error ? (
          <View className="mb-4 rounded-[12px] border px-4 py-3 flex-row items-center gap-3" style={{ backgroundColor: 'var(--c-warning-bg)', borderColor: 'var(--c-warning-border)' } as any}>
            <MaterialIcons name="info-outline" size={17} color="var(--c-warning-fg)" />
            <Text className="text-[13px] font-semibold flex-1" style={{ color: 'var(--c-warning-fg)' }}>{error}</Text>
            <Pressable onPress={handleRefresh} accessibilityRole="button" accessibilityLabel="Reîncearcă" className="ui-press px-2 py-1">
              <Text className="text-[13px] font-bold" style={{ color: 'var(--c-warning-fg)' }}>Reîncearcă</Text>
            </Pressable>
          </View>
        ) : null}

        {/* 8/4 on desktop: the left column holds the editable form (two cards
            + save bar), the rail holds short, self-contained blocks. One
            column below lg. */}
        <View className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-8">
          <View className="lg:col-span-7 2xl:col-span-8 min-w-0">
            <ProfileForm profile={profile} onSave={handleSaveProfile} />
          </View>

          <View className="lg:col-span-5 2xl:col-span-4 min-w-0 gap-4">
            <AppearanceCard />

            <ProfileCard icon="account-circle" tone="neutral" title="Cont" description="Datele gestionate de clubul tău.">
              <View className="-my-2.5">
                <InfoRow icon="mail" label="Email" value={profile.email} />
                <View className="h-px" style={{ backgroundColor: 'var(--c-border-soft)' }} />
                <InfoRow icon="apartment" label="Club" value={profile.clubName ?? 'Neatribuit'} />
                <View className="h-px" style={{ backgroundColor: 'var(--c-border-soft)' }} />
                <InfoRow icon="groups" label="Echipă" value={profile.teamName ?? 'Neatribuit'} />
                <View className="h-px" style={{ backgroundColor: 'var(--c-border-soft)' }} />
                <InfoRow icon="badge" label="Rol" value={roleLabel} />
              </View>
            </ProfileCard>

            <PasswordChangeForm onChangePassword={handlePasswordChange} />

            <ProfileCard icon="logout" tone="danger" title="Sesiune" description="Ieși din cont pe acest dispozitiv.">
              <Pressable
                onPress={handleLogout}
                className="ui-press h-11 rounded-[11px] border flex-row items-center justify-center gap-2"
                style={{ backgroundColor: 'var(--c-danger-bg)', borderColor: 'var(--c-danger-border)' } as any}
                accessibilityRole="button"
                accessibilityLabel="Deconectare"
              >
                <MaterialIcons name="logout" size={17} color="var(--c-danger-fg)" />
                <Text className="text-[13.5px] font-bold" style={{ color: 'var(--c-danger-fg)' }}>Deconectare</Text>
              </Pressable>
            </ProfileCard>
          </View>
        </View>
      </PageContainer>
    </ScrollView>
  );
}

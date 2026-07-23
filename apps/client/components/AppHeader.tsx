import { ActivityIndicator, Image, Modal, Pressable, Text, TextInput, View } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { theme } from '../constants/designSystem';
import { useFirebaseAuth } from '../context/AuthContext';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  headerActions?: ReactNode;
  avatarUrl?: string | null;
  initials: string;
  userName?: string | null;
  role?: string | null;
  topInset?: number;
  mobile?: boolean;
  onOpenMenu?: () => void;
};

export default function AppHeader({
  title,
  subtitle = 'BCMS',
  searchPlaceholder,
  searchValue,
  onSearchChange,
  headerActions,
  avatarUrl,
  initials,
  userName,
  role,
  topInset = 0,
  mobile = false,
  onOpenMenu,
}: AppHeaderProps) {
  const router = useRouter();
  const { signOut } = useFirebaseAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const openProfile = () => {
    setProfileMenuOpen(false);
    router.push('/profile');
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      setProfileMenuOpen(false);
      await signOut();
      router.replace('/login');
    } catch (error) {
      console.error('[AppHeader] Logout failed:', error);
    } finally {
      setLoggingOut(false);
    }
  };

  if (mobile) {
    return (
      <View
        className="flex lg:hidden bg-[#F8FBFF] px-4 pb-3 z-10 w-full border-b border-[#DDE7F5]"
        style={{ paddingTop: Math.max(topInset + 8, 18) }}
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            <Pressable
              onPress={() => setProfileMenuOpen(true)}
              className="w-11 h-11 rounded-[18px] overflow-hidden items-center justify-center bg-[#E0F2FE] border border-white"
              style={theme.shadow.card}
              accessibilityRole="button"
              accessibilityLabel="Open profile actions"
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} className="w-full h-full" />
              ) : (
                <Text className="font-black text-[#0369A1]">{initials}</Text>
              )}
            </Pressable>
            <View className="flex-1 min-w-0">
              <Text className="text-[#94A3B8] text-[10px] font-black uppercase tracking-widest">{subtitle}</Text>
              <Text className="text-[#07152F] font-black text-[19px] tracking-tight leading-tight" numberOfLines={1}>
                {title}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-2">
            <Pressable className="relative w-10 h-10 items-center justify-center rounded-[16px] bg-white border border-[#E5ECF6]">
              <MaterialIcons name="notifications" size={21} color={theme.colors.navy} />
              <View className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-[#38BDF8] rounded-full border-2 border-white" />
            </Pressable>
            <Pressable
              onPress={onOpenMenu}
              className="w-10 h-10 items-center justify-center rounded-[16px] bg-[#0B1E3D]"
              accessibilityRole="button"
              accessibilityLabel="Open navigation menu"
            >
              <MaterialIcons name="menu" size={23} color="#FFFFFF" />
            </Pressable>
          </View>
        </View>

        <View className="mt-3 flex-row items-center bg-white rounded-[18px] px-4 h-11 border border-[#DDE7F5]">
          <MaterialIcons name="search" size={20} color={theme.colors.faint} />
          <TextInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onChangeText={onSearchChange}
            className="flex-1 ml-3 text-[14px] font-semibold text-[#0E2041] outline-none"
            placeholderTextColor={theme.colors.faint}
          />
        </View>
        <ProfileActionsMenu
          visible={profileMenuOpen}
          onClose={() => setProfileMenuOpen(false)}
          onViewProfile={openProfile}
          onLogout={handleLogout}
          loggingOut={loggingOut}
          avatarUrl={avatarUrl}
          initials={initials}
          userName={userName}
          role={role}
          mobile
          topInset={topInset}
        />
      </View>
    );
  }

  return (
    <View className="hidden lg:flex bg-white/60 px-6 flex-row items-center z-10 shrink-0 border-b border-white/70 backdrop-blur-xl" style={{ height: 68 } as any}>
      <View style={{ flex: 1, maxWidth: 390 }}>
        <View className="flex-row items-center bg-white/92 rounded-[17px] px-4 py-2.5 border border-white" style={{ boxShadow: '0 12px 26px rgba(11, 30, 61, 0.06)' } as any}>
          <MaterialIcons name="search" size={18} color={theme.colors.faint} />
          <TextInput
            placeholder={searchPlaceholder}
            value={searchValue}
            onChangeText={onSearchChange}
            className="flex-1 ml-3 text-[13px] font-semibold text-[#0E2041] outline-none"
            placeholderTextColor={theme.colors.faint}
          />
        </View>
      </View>

      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
        {headerActions ?? null}
      </View>

      <View className="flex-row items-center gap-3">
        <Pressable className="relative w-10 h-10 items-center justify-center rounded-[15px] bg-white/92 border border-white">
          <MaterialIcons name="notifications" size={19} color={theme.colors.muted} />
          <View className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-[#38BDF8] rounded-full border-2 border-white" />
        </Pressable>
        <Pressable className="w-10 h-10 items-center justify-center rounded-[15px] bg-white/92 border border-white">
          <MaterialIcons name="help-outline" size={19} color={theme.colors.muted} />
        </Pressable>
        <Pressable
          onPress={() => setProfileMenuOpen(true)}
          className="flex-row items-center pl-4 border-l border-[#DDE7F5] gap-3"
          accessibilityRole="button"
          accessibilityLabel="Open profile actions"
        >
          <View className="flex-col items-end">
            <Text className="text-[12px] font-black tracking-tight text-[#0E2041]">{userName ?? 'Admin Panel'}</Text>
            <Text className="text-[9px] font-black tracking-widest uppercase text-[#94A3B8]">{role ?? 'Workspace'}</Text>
          </View>
          <View className="w-9 h-9 rounded-full bg-[#0B1E3D] items-center justify-center overflow-hidden border-2 border-white">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} className="w-full h-full" />
            ) : (
              <Text className="font-black text-[14px] text-white">{initials}</Text>
            )}
          </View>
        </Pressable>
      </View>
      <ProfileActionsMenu
        visible={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        onViewProfile={openProfile}
        onLogout={handleLogout}
        loggingOut={loggingOut}
        avatarUrl={avatarUrl}
        initials={initials}
        userName={userName}
        role={role}
      />
    </View>
  );
}

function ProfileActionsMenu({
  visible,
  onClose,
  onViewProfile,
  onLogout,
  loggingOut,
  avatarUrl,
  initials,
  userName,
  role,
  mobile = false,
  topInset = 0,
}: {
  visible: boolean;
  onClose: () => void;
  onViewProfile: () => void;
  onLogout: () => void;
  loggingOut: boolean;
  avatarUrl?: string | null;
  initials: string;
  userName?: string | null;
  role?: string | null;
  mobile?: boolean;
  topInset?: number;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/10" onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="absolute rounded-[24px] bg-white border border-[#DDE7F5] overflow-hidden"
          style={[
            theme.shadow.card,
            mobile
              ? { top: Math.max(topInset + 66, 82), left: 16, right: 16 }
              : { top: 66, right: 24, width: 270 },
          ]}
        >
          <View className="px-4 py-4 border-b border-[#EEF3FA] flex-row items-center gap-3">
            <View className="w-11 h-11 rounded-full bg-[#0B1E3D] items-center justify-center overflow-hidden">
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} className="w-full h-full" />
              ) : (
                <Text className="font-black text-white">{initials}</Text>
              )}
            </View>
            <View className="flex-1 min-w-0">
              <Text className="text-[#0E2041] text-[14px] font-black" numberOfLines={1}>
                {userName ?? 'Admin Panel'}
              </Text>
              <Text className="text-[#94A3B8] text-[10px] font-black uppercase tracking-widest mt-1" numberOfLines={1}>
                {role ?? 'Workspace'}
              </Text>
            </View>
          </View>

          <View className="p-2">
            <Pressable
              onPress={onViewProfile}
              className="min-h-[48px] rounded-[16px] px-3 flex-row items-center active:bg-[#F4F8FD]"
              accessibilityRole="button"
            >
              <View className="w-9 h-9 rounded-[14px] bg-[#EAF2FF] items-center justify-center mr-3">
                <MaterialIcons name="person-outline" size={20} color="var(--c-brand-fg)" />
              </View>
              <Text className="text-[#0E2041] text-[14px] font-black flex-1">View Profile</Text>
              <MaterialIcons name="chevron-right" size={20} color="var(--c-faint)" />
            </Pressable>

            <Pressable
              onPress={onLogout}
              disabled={loggingOut}
              className={`min-h-[48px] rounded-[16px] px-3 flex-row items-center mt-1 active:bg-[#FFF1F2] ${loggingOut ? 'opacity-70' : ''}`}
              accessibilityRole="button"
            >
              <View className="w-9 h-9 rounded-[14px] bg-[#FFE4E6] items-center justify-center mr-3">
                {loggingOut ? (
                  <ActivityIndicator size="small" color="var(--c-danger)" />
                ) : (
                  <MaterialIcons name="logout" size={20} color="var(--c-danger)" />
                )}
              </View>
              <Text className="text-[#BE123C] text-[14px] font-black flex-1">
                {loggingOut ? 'Logging out...' : 'Log out'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

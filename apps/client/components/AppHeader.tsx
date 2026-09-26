import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from '@/src/web/reactNative';
import { useRouter } from '@/src/web/expoRouter';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { theme } from '../constants/designSystem';
import { useSession } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { formatRelativeDate } from './myclub/teamDisplay';
import type { AppNotification } from '../services/notificationsApi';

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
  const { signOut } = useSession();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  // Mobile search is collapsed to an icon by default and expands to a full
  // input row on tap, reclaiming the ~55px the always-on search bar used to
  // cost on every screen.
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { unreadCount, notifications, loading: notificationsLoading, loadNotifications, markAsRead, markAllAsRead } = useNotifications();

  const openProfile = () => {
    setProfileMenuOpen(false);
    router.push('/profile');
  };

  const openNotifications = () => {
    setNotificationsOpen(true);
    loadNotifications();
  };

  const handleNotificationPress = (notification: AppNotification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    setNotificationsOpen(false);
    // There is no deep-linkable per-event route on the player side (schedule
    // detail opens as an in-page modal, not a URL) — send them to the tab
    // that lists the event instead.
    if (notification.eventId != null) {
      router.push('/schedule');
    }
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
        className="flex lg:hidden px-4 pb-3 z-10 w-full border-b"
        style={{ paddingTop: Math.max(topInset + 8, 16), backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}
      >
        {searchOpen ? (
          // Search MODE — replaces the whole header row rather than adding a
          // second one, so the search costs zero extra vertical space when
          // it's not in use (the request: reclaim the always-on search bar).
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setSearchOpen(false)}
              className="w-10 h-10 items-center justify-center rounded-[12px]"
              accessibilityRole="button"
              accessibilityLabel="Închide căutarea"
            >
              <MaterialIcons name="arrow-back" size={22} color={theme.colors.ink} />
            </Pressable>
            <View className="flex-1 flex-row items-center rounded-[12px] px-3 h-11 border" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
              <MaterialIcons name="search" size={20} color={theme.colors.faint} />
              {/* No autoFocus: opening the field should NOT force the keyboard
                  up — the user taps the field when they want to type. Font is
                  16px so iOS Safari doesn't zoom the page on focus. */}
              <TextInput
                placeholder={searchPlaceholder}
                value={searchValue}
                onChangeText={onSearchChange}
                className="flex-1 ml-2.5 text-[16px] font-medium outline-none"
                style={{ color: 'var(--c-ink)' } as any}
                placeholderTextColor={theme.colors.faint}
                returnKeyType="search"
              />
              {searchValue.length > 0 ? (
                <Pressable onPress={() => onSearchChange('')} accessibilityLabel="Golește căutarea" className="w-6 h-6 items-center justify-center">
                  <MaterialIcons name="close" size={18} color={theme.colors.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : (
          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center gap-3 flex-1 min-w-0">
              <Pressable
                onPress={() => setProfileMenuOpen(true)}
                className="w-10 h-10 rounded-[12px] overflow-hidden items-center justify-center border"
                style={{ backgroundColor: 'var(--c-surface-tint)', borderColor: 'var(--c-border)' } as any}
                accessibilityRole="button"
                accessibilityLabel="Open profile actions"
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} className="w-full h-full" />
                ) : (
                  <Text className="font-black" style={{ color: 'var(--c-brand-fg)' }}>{initials}</Text>
                )}
              </Pressable>
              <View className="flex-1 min-w-0">
                <Text className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--c-faint)' }}>{subtitle}</Text>
                <Text className="font-black text-[18px] tracking-tight leading-tight" style={{ color: 'var(--c-ink-strong)' }} numberOfLines={1}>
                  {title}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center gap-1.5">
              <Pressable
                onPress={() => setSearchOpen(true)}
                className="relative w-10 h-10 items-center justify-center rounded-[12px] border"
                style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
                accessibilityRole="button"
                accessibilityLabel="Caută"
              >
                <MaterialIcons name="search" size={21} color={theme.colors.muted} />
                {/* Dot signals an active search while the field is collapsed. */}
                {searchValue.length > 0 ? (
                  <View className="absolute top-2 right-2 w-2 h-2 rounded-full border-2" style={{ backgroundColor: 'var(--c-brand-surface)', borderColor: 'var(--c-surface)' } as any} />
                ) : null}
              </Pressable>
              <Pressable
                onPress={openNotifications}
                className="relative w-10 h-10 items-center justify-center rounded-[12px] border"
                style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
                accessibilityRole="button"
                accessibilityLabel="Notificări"
              >
                <MaterialIcons name="notifications" size={20} color={theme.colors.muted} />
                {unreadCount > 0 ? (
                  <View className="absolute top-2 right-2 w-2 h-2 rounded-full border-2" style={{ backgroundColor: 'var(--c-sky)', borderColor: 'var(--c-surface)' } as any} />
                ) : null}
              </Pressable>
              {onOpenMenu ? (
                <Pressable
                  onPress={onOpenMenu}
                  className="w-10 h-10 items-center justify-center rounded-[12px]"
                  style={{ backgroundColor: 'var(--c-brand-surface-deep)' } as any}
                  accessibilityRole="button"
                  accessibilityLabel="Open navigation menu"
                >
                  <MaterialIcons name="menu" size={22} color="#FFFFFF" />
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
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
        <NotificationsPanel
          visible={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          notifications={notifications}
          loading={notificationsLoading}
          onPressNotification={handleNotificationPress}
          onMarkAllAsRead={markAllAsRead}
          mobile
          topInset={topInset}
        />
      </View>
    );
  }

  return (
    <View className="hidden lg:flex px-6 flex-row items-center z-10 shrink-0 border-b" style={{ height: 60, backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any}>
      <View style={{ flex: 1, maxWidth: 380 }}>
        <View className="flex-row items-center rounded-[10px] px-3 py-2 border" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
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

      <View className="flex-row items-center gap-2.5">
        <Pressable
          onPress={openNotifications}
          className="relative w-9 h-9 items-center justify-center rounded-[10px] border"
          style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}
          accessibilityRole="button"
          accessibilityLabel="Notificări"
        >
          <MaterialIcons name="notifications" size={19} color={theme.colors.muted} />
          {unreadCount > 0 ? (
            <View className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--c-sky)' }} />
          ) : null}
        </Pressable>
        <Pressable className="w-9 h-9 items-center justify-center rounded-[10px] border" style={{ backgroundColor: 'var(--c-surface-2)', borderColor: 'var(--c-border)' } as any}>
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
      <NotificationsPanel
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={notifications}
        loading={notificationsLoading}
        onPressNotification={handleNotificationPress}
        onMarkAllAsRead={markAllAsRead}
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

function NotificationsPanel({
  visible,
  onClose,
  notifications,
  loading,
  onPressNotification,
  onMarkAllAsRead,
  mobile = false,
  topInset = 0,
}: {
  visible: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  loading: boolean;
  onPressNotification: (notification: AppNotification) => void;
  onMarkAllAsRead: () => void;
  mobile?: boolean;
  topInset?: number;
}) {
  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/10" onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="absolute rounded-[24px] border overflow-hidden"
          style={[
            theme.shadow.card,
            { backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)' } as any,
            mobile
              ? { top: Math.max(topInset + 66, 82), left: 16, right: 16, maxHeight: '70%' }
              : { top: 66, right: 24, width: 340, maxHeight: 440 },
          ]}
        >
          <View className="px-4 py-3.5 border-b flex-row items-center justify-between" style={{ borderColor: 'var(--c-border)' } as any}>
            <Text className="text-[14px] font-black" style={{ color: 'var(--c-ink-strong)' }}>Notificări</Text>
            {hasUnread ? (
              <Pressable onPress={onMarkAllAsRead} accessibilityRole="button">
                <Text className="text-[12px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>Marchează toate ca citite</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: mobile ? undefined : 380 }}>
            {loading && notifications.length === 0 ? (
              <View className="py-10 items-center justify-center">
                <ActivityIndicator size="small" color="var(--c-brand-fg)" />
              </View>
            ) : notifications.length === 0 ? (
              <View className="py-10 px-4 items-center justify-center">
                <MaterialIcons name="notifications-none" size={28} color={theme.colors.faint} />
                <Text className="text-[13px] font-semibold mt-2" style={{ color: 'var(--c-muted)' }}>
                  Nu ai nicio notificare
                </Text>
              </View>
            ) : (
              <View className="p-2">
                {notifications.map((notification) => (
                  <Pressable
                    key={notification.id}
                    onPress={() => onPressNotification(notification)}
                    className="rounded-[16px] px-3 py-3 flex-row items-start gap-3"
                    style={{ backgroundColor: notification.isRead ? 'transparent' : 'var(--c-surface-tint)' } as any}
                  >
                    <View className="w-9 h-9 rounded-[14px] items-center justify-center mt-0.5" style={{ backgroundColor: 'var(--c-surface-2)' } as any}>
                      <MaterialIcons name="notifications" size={17} color="var(--c-brand-fg)" />
                    </View>
                    <View className="flex-1 min-w-0">
                      <Text className="text-[13px] font-black" style={{ color: 'var(--c-ink-strong)' }} numberOfLines={1}>
                        {notification.title}
                      </Text>
                      <Text className="text-[12.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={2}>
                        {notification.message}
                      </Text>
                      <Text className="text-[10.5px] font-bold mt-1" style={{ color: 'var(--c-faint)' }}>
                        {formatRelativeDate(notification.createdAt)}
                      </Text>
                    </View>
                    {!notification.isRead ? (
                      <View className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: 'var(--c-sky)' } as any} />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

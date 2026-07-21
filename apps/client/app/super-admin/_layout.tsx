import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from '@/src/web/reactNative';
import { Slot, useRouter } from '@/src/web/expoRouter';
import { useSafeAreaInsets } from '@/src/web/safeArea';
import SuperAdminHeader from '../../components/super-admin/SuperAdminHeader';
import SuperAdminSidebar from '../../components/super-admin/SuperAdminSidebar';
import { getHomeRouteForRole, isSuperadmin } from '../../utils/authSession';
import { useFirebaseAuth } from '../../context/AuthContext';
import { LoadingScreen } from '../../components/ui/ScreenState';

export default function SuperAdminLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session, initializing } = useFirebaseAuth();
  const isDesktop = width >= 768;
  const [sidebarVisible, setSidebarVisible] = useState(false);

  useEffect(() => {
    if (initializing) return;

    if (!session) {
      router.replace('/login');
      return;
    }

    if (!isSuperadmin(session)) {
      router.replace(getHomeRouteForRole(session.role));
    }
  }, [initializing, router, session]);

  if (initializing || !session || !isSuperadmin(session)) {
    return <LoadingScreen message="Preparing platform control..." backgroundColor="#EEF3FF" color="#173AA8" />;
  }

  const initials = (session.name ?? 'SA')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part: string) => part[0]?.toUpperCase() ?? '')
    .join('') || 'SA';

  return (
    <View className="flex-1 bg-[#EEF3FF]">
      <SuperAdminSidebar visible={sidebarVisible} onClose={() => setSidebarVisible(false)} />

      <View
        className="flex-1 min-h-screen"
        style={{
          marginLeft: isDesktop ? 290 : 0,
          paddingTop: insets.top,
        }}
      >
        <SuperAdminHeader
          initials={initials}
          displayName={session.name ?? 'Super Admin'}
          onMenuPress={isDesktop ? undefined : () => setSidebarVisible(true)}
        />
        <View className="flex-1 min-h-0">
          <Slot />
        </View>
      </View>
    </View>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, Text, useWindowDimensions, View } from '@/src/web/reactNative';
import { Link, usePathname } from '@/src/web/expoRouter';
import { MaterialIcons } from '@/src/web/expoVectorIcons';

type NavItem = {
  label: string;
  href: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

type SuperAdminSidebarProps = {
  visible?: boolean;
  onClose?: () => void;
};

const ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/super-admin', icon: 'dashboard' },
  { label: 'Club Directory', href: '/super-admin/clubs', icon: 'apartment' },
  { label: 'User Directory', href: '/super-admin/users', icon: 'groups' },
  { label: 'Create User', href: '/super-admin/create-user', icon: 'person-add' },
  { label: 'Role Management', href: '/super-admin/roles', icon: 'admin-panel-settings' },
  { label: 'Audit Logs', href: '/super-admin/audit-logs', icon: 'receipt-long' },
  { label: 'System Settings', href: '/super-admin/settings', icon: 'settings' },
];

function SidebarContent({ pathname, onClose }: { pathname: string; onClose?: () => void }) {
  return (
    <>
      <View className="px-8 pt-8 pb-6">
        <View className="w-14 h-14 rounded-2xl bg-[#173AA8] items-center justify-center shadow-lg shadow-blue-900/20">
          <MaterialIcons name="flash-on" size={28} color="#fff" />
        </View>
        <Text className="text-[#102A72] text-[28px] font-black mt-5 tracking-tight">Super Admin</Text>
        <Text className="text-[#6B7AA6] uppercase tracking-[0.28em] text-[10px] font-black mt-1">
          Platform Control
        </Text>
      </View>

      <View className="px-4 gap-1 flex-1">
        {ITEMS.map((item) => {
          const active =
            item.href === '/super-admin'
              ? pathname === '/super-admin'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href as any}
              asChild
              onPress={onClose}
            >
              <Pressable className={`flex-row items-center rounded-2xl px-5 py-4 ${active ? 'bg-[#DCE6FF]' : 'bg-transparent'}`}>
                <MaterialIcons name={item.icon} size={22} color={active ? '#173AA8' : '#7283A7'} />
                <Text className={`ml-4 text-[15px] font-semibold ${active ? 'text-[#173AA8]' : 'text-[#56627F]'}`}>
                  {item.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>

      <View className="px-8 pb-6">
        <Text className="text-[#8AA0D0] text-[11px] font-black uppercase tracking-widest">BCMS</Text>
      </View>
    </>
  );
}

export default function SuperAdminSidebar({ visible = false, onClose }: SuperAdminSidebarProps) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const slideX = useRef(new Animated.Value(width)).current;
  const [isRendered, setIsRendered] = useState(visible);
  const drawerWidth = Math.min(320, Math.max(280, width * 0.86));

  useEffect(() => {
    if (isDesktop) {
      return;
    }

    if (visible) {
      setIsRendered(true);
      slideX.setValue(-drawerWidth);
      Animated.timing(slideX, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (isRendered) {
      Animated.timing(slideX, {
        toValue: -drawerWidth,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setIsRendered(false);
        }
      });
    }
  }, [drawerWidth, isDesktop, isRendered, slideX, visible]);

  const closeDrawer = () => {
    if (onClose) {
      onClose();
    }
  };

  if (!isDesktop) {
    if (!isRendered) {
      return null;
    }

    return (
      <Modal
        visible={isRendered}
        transparent
        animationType="fade"
        onRequestClose={closeDrawer}
      >
        <View className="flex-1 bg-black/35">
          <Pressable className="absolute inset-0" onPress={closeDrawer} />
          <View className="flex-row flex-1">
            <Animated.View
              className="h-full bg-[#F6F8FF] border-r border-[#E7ECFF]"
              style={{
                width: drawerWidth,
                transform: [{ translateX: slideX }],
              }}
            >
              <SidebarContent pathname={pathname} onClose={onClose} />
            </Animated.View>
            <View className="flex-1" />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View
      className="bg-[#F6F8FF] border-r border-[#E7ECFF]"
      style={{
        position: Platform.OS === 'web' ? 'fixed' : 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 290,
      }}
    >
      <SidebarContent pathname={pathname} onClose={onClose} />
    </View>
  );
}

import { Modal, Pressable, ScrollView, Text, View } from '@/src/web/reactNative';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { theme } from '../constants/designSystem';
import type { AdminMenuIconName } from './Sidebar';

type BottomItem = {
  href: string;
  label: string;
  icon: AdminMenuIconName;
  match: string;
};

type MenuItem = {
  href: string;
  label: string;
  icon: AdminMenuIconName;
};

type MobileBottomNavigationProps = {
  items: BottomItem[];
  pathname: string;
  isDashboard: boolean;
  moreIsActive: boolean;
  bottomInset: number;
  onOpenMore: () => void;
};

type MobileNavigationSheetProps = {
  visible: boolean;
  items: MenuItem[];
  activeHref?: string;
  onClose: () => void;
  bottomInset: number;
};

export function MobileBottomNavigation({
  items,
  pathname,
  isDashboard,
  moreIsActive,
  bottomInset,
  onOpenMore,
}: MobileBottomNavigationProps) {
  return (
    <View
      className="flex lg:hidden flex-row items-center bg-white border-t border-[#E6EEF8] absolute bottom-0 w-full z-20 px-2"
      style={{ paddingTop: 10, paddingBottom: Math.max(bottomInset, 12), ...theme.shadow.lift }}
    >
      {items.map((item) => {
        const isActive = item.match === 'dashboard' ? isDashboard : pathname.includes(item.match);

        return (
          <RouterLink key={item.href} to={item.href} className="flex-1 no-underline">
            <View className="items-center justify-center py-1 px-1">
              <View className="items-center justify-center rounded-[18px] px-2 py-2 min-h-[52px] w-full" style={{ backgroundColor: isActive ? '#EAF2FF' : 'transparent' }}>
                <MaterialIcons name={item.icon} size={20} color={isActive ? theme.colors.royal : theme.colors.faint} />
                <Text className="text-[10px] mt-1 font-black" style={{ color: isActive ? theme.colors.royal : theme.colors.faint }} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            </View>
          </RouterLink>
        );
      })}
      <Pressable
        onPress={onOpenMore}
        className="flex-1 items-center justify-center py-1 px-1"
        accessibilityRole="button"
        accessibilityLabel="Open all admin pages"
      >
        <View className="items-center justify-center rounded-[18px] px-2 py-2 min-h-[52px] w-full" style={{ backgroundColor: moreIsActive ? '#EAF2FF' : 'transparent' }}>
          <MaterialIcons name="apps" size={20} color={moreIsActive ? theme.colors.royal : theme.colors.faint} />
          <Text className="text-[10px] mt-1 font-black" style={{ color: moreIsActive ? theme.colors.royal : theme.colors.faint }} numberOfLines={1}>
            More
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

export function MobileNavigationSheet({
  visible,
  items,
  activeHref,
  onClose,
  bottomInset,
}: MobileNavigationSheetProps) {
  const navigate = useNavigate();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/35 justify-end" onPress={onClose}>
        <Pressable className="bg-[#F8FBFF] rounded-t-[32px] px-4 pt-4" style={{ paddingBottom: Math.max(bottomInset + 18, 34) }}>
          <View className="self-center w-12 h-1.5 rounded-full bg-[#CBD5E1] mb-4" />
          <View className="flex-row items-center justify-between mb-3">
            <View>
              <Text className="text-[#07152F] text-xl font-black">Navigation</Text>
              <Text className="text-[#64748B] text-xs font-bold mt-1">Club workspace sections</Text>
            </View>
            <Pressable onPress={onClose} className="w-10 h-10 rounded-full bg-white items-center justify-center border border-[#E4ECF7]">
              <MaterialIcons name="close" size={20} color={theme.colors.text} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
            <View className="gap-2 pb-2">
              {items.map((item) => {
                const active = activeHref === item.href;
                return (
                  <Pressable
                      key={item.href}
                      onPress={() => {
                        onClose();
                        navigate(item.href);
                      }}
                      className="min-h-[58px] rounded-[22px] px-4 flex-row items-center border"
                      style={{
                        backgroundColor: active ? '#0B1E3D' : '#FFFFFF',
                        borderColor: active ? '#0B1E3D' : theme.colors.lineSoft,
                      }}
                    >
                      <View className="w-10 h-10 rounded-[16px] items-center justify-center mr-3" style={{ backgroundColor: active ? 'rgba(255,255,255,0.14)' : '#F2F6FD' }}>
                        <MaterialIcons name={item.icon} size={19} color={active ? '#FFFFFF' : theme.colors.royal} />
                      </View>
                      <Text className="text-[14px] font-black flex-1" style={{ color: active ? '#FFFFFF' : theme.colors.text }}>
                        {item.label}
                      </Text>
                      <MaterialIcons name="chevron-right" size={20} color={active ? '#FFFFFF' : theme.colors.faint} />
                    </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

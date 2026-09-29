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
  moreIsActive?: boolean;
  bottomInset: number;
  onOpenMore?: () => void;
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
    // Structural surfaces use tokens, matching Sidebar, so the bar players see on
    // every screen tracks light/dark instead of staying white on a dark shell.
    <View
      className="flex lg:hidden flex-row items-center border-t fixed bottom-0 left-0 right-0 w-full z-20 px-2"
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', paddingTop: 10, paddingBottom: Math.max(bottomInset, 12), ...theme.shadow.lift } as any}
    >
      {items.map((item) => {
        const isActive = item.match === 'dashboard' ? isDashboard : pathname.includes(item.match);

        return (
          <RouterLink key={item.href} to={item.href} className="flex-1 no-underline">
            <View className="items-center justify-center py-1 px-1">
              <View className="items-center justify-center rounded-[18px] px-2 py-2 min-h-[52px] w-full" style={{ backgroundColor: isActive ? 'var(--c-surface-tint)' : 'transparent' }}>
                <MaterialIcons name={item.icon} size={20} color={isActive ? theme.colors.royal : theme.colors.faint} />
                <Text className="text-[11px] mt-1 font-semibold" style={{ color: isActive ? theme.colors.royal : theme.colors.faint }} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
            </View>
          </RouterLink>
        );
      })}
      {onOpenMore ? (
        <Pressable
          onPress={onOpenMore}
          className="flex-1 items-center justify-center py-1 px-1"
          accessibilityRole="button"
          accessibilityLabel="Toate secțiunile"
        >
          <View className="items-center justify-center rounded-[18px] px-2 py-2 min-h-[52px] w-full" style={{ backgroundColor: moreIsActive ? 'var(--c-surface-tint)' : 'transparent' }}>
            <MaterialIcons name="apps" size={20} color={moreIsActive ? theme.colors.royal : theme.colors.faint} />
            <Text className="text-[11px] mt-1 font-semibold" style={{ color: moreIsActive ? theme.colors.royal : theme.colors.faint }} numberOfLines={1}>
              Mai mult
            </Text>
          </View>
        </Pressable>
      ) : null}
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
      <Pressable className="ui-backdrop flex-1 justify-end" style={{ backgroundColor: 'rgba(10,15,28,0.5)' }} onPress={onClose}>
        <Pressable
          className="ui-sheet rounded-t-[22px] px-4 pt-3 border-t"
          style={{
            backgroundColor: 'var(--c-surface)',
            borderColor: 'var(--c-border)',
            paddingBottom: Math.max(bottomInset + 18, 28),
            boxShadow: '0 -12px 32px -12px rgba(0,0,0,0.35)',
          } as any}
        >
          <View className="self-center w-10 h-1 rounded-full mb-4" style={{ backgroundColor: 'var(--c-border-strong)' }} />
          <View className="flex-row items-center justify-between mb-3 px-1">
            <Text className="text-[18px] font-bold" style={{ color: 'var(--c-ink)' }}>Meniu</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Închide meniul"
              className="ui-press w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: 'var(--c-surface-2)' }}
            >
              <MaterialIcons name="close" size={18} color="var(--c-ink-soft)" />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: '62vh' } as any}>
            {/* Two-column tiles: every destination visible at once instead of a
                long list to scroll. */}
            <View className="grid grid-cols-2 gap-2 pb-2">
              {items.map((item) => {
                const active = activeHref === item.href;
                return (
                  <Pressable
                    key={item.href}
                    onPress={() => {
                      onClose();
                      navigate(item.href);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                    className="ui-press min-h-[64px] rounded-[14px] px-3 py-3 flex-row items-center gap-2.5 border text-left"
                    style={{
                      backgroundColor: active ? 'var(--c-brand-surface)' : 'var(--c-surface-2)',
                      borderColor: active ? 'var(--c-brand-surface)' : 'var(--c-border-soft)',
                    } as any}
                  >
                    <View
                      className="w-9 h-9 rounded-[10px] items-center justify-center shrink-0"
                      style={{ backgroundColor: active ? 'rgba(255,255,255,0.18)' : 'var(--c-surface)' }}
                    >
                      <MaterialIcons name={item.icon} size={18} color={active ? '#FFFFFF' : 'var(--c-brand-fg)'} />
                    </View>
                    <Text
                      className="text-[13.5px] font-semibold flex-1 min-w-0 leading-tight"
                      style={{ color: active ? '#FFFFFF' : 'var(--c-ink)' }}
                      numberOfLines={2}
                    >
                      {item.label}
                    </Text>
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

import React from 'react';
import { FlatList, Modal, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { dash } from '../dashboard/dashboardTheme';
import { plural } from '../../utils/plural';

export type RosterFilterSheetItem = { id: string; label: string };

interface RosterFilterSheetProps {
  visible: boolean;
  title: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  items: RosterFilterSheetItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export default function RosterFilterSheet({
  visible,
  title,
  icon = 'apps',
  items,
  selectedId,
  onSelect,
  onClose,
}: RosterFilterSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className="flex-1 items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(2, 8, 23, 0.55)' }}
        onPress={onClose}
      >
        <Pressable
          className="rounded-[18px] w-full max-w-[360px] max-h-[70vh] border dash-fade-in overflow-hidden flex-col"
          style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: '0 28px 70px rgba(2, 8, 23, 0.35)' } as any}
          onPress={(event: any) => event.stopPropagation()}
        >
          <View
            className="flex-row items-center justify-between px-5 pt-5 pb-4"
            style={{ borderBottomWidth: 1, borderBottomColor: 'var(--c-border)' } as any}
          >
            <View className="flex-row items-center flex-1 pr-3">
              <View
                className="w-9 h-9 rounded-[12px] items-center justify-center mr-3"
                style={{ backgroundColor: 'var(--c-surface-tint)' }}
              >
                <MaterialIcons name={icon} size={17} color="var(--c-brand-fg)" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold" style={{ color: dash.ink }} numberOfLines={1}>
                  {title}
                </Text>
                <Text className="text-[11px] mt-0.5 font-medium" style={{ color: dash.muted }}>
                  {plural(items.length, 'opțiune', 'opțiuni')} disponibile
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Închide"
              className="tap-40 w-8 h-8 rounded-full items-center justify-center active:opacity-70"
              style={{ backgroundColor: 'var(--c-surface-3)' }}
            >
              <MaterialIcons name="close" size={15} color="var(--c-muted)" />
            </Pressable>
          </View>
          <FlatList
            className="px-3 py-3 max-h-[50vh]"
            data={items}
            keyExtractor={(item: RosterFilterSheetItem) => item.id}
            renderItem={({ item }: { item: RosterFilterSheetItem }) => {
              const isSelected = selectedId != null && item.id === selectedId;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item.id);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  className="dash-row-hover flex-row items-center justify-between min-h-11 py-2.5 px-3.5 rounded-[11px] mb-1 border active:opacity-80"
                  style={{
                    backgroundColor: isSelected ? 'var(--c-surface-tint)' : 'transparent',
                    borderColor: isSelected ? 'var(--c-brand-border)' : 'transparent',
                  } as any}
                >
                  <Text
                    className="text-sm"
                    style={{ color: isSelected ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)', fontWeight: isSelected ? '700' : '500' }}
                  >
                    {item.label}
                  </Text>
                  {isSelected ? (
                    <View
                      className="w-5 h-5 rounded-full items-center justify-center"
                      style={{ backgroundColor: 'var(--c-brand-surface)' }}
                    >
                      <MaterialIcons name="check" size={12} color="var(--c-on-brand)" />
                    </View>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

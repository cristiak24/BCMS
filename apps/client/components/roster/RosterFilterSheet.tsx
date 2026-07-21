import React from 'react';
import { FlatList, Modal, Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import { dash } from '../dashboard/dashboardTheme';

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
        style={{ backgroundColor: 'rgba(10,15,28,0.5)' }}
        onPress={onClose}
      >
        <Pressable
          className="rounded-[22px] w-full max-w-[360px] max-h-[70vh] border dash-fade-in overflow-hidden flex-col"
          style={{ backgroundColor: dash.surface, borderColor: 'rgba(15,23,42,0.06)', ...dash.shadow.lift }}
          onPress={(event: any) => event.stopPropagation()}
        >
          <View
            pointerEvents="none"
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ backgroundImage: 'linear-gradient(90deg, #123B95, #2563EB)' } as any}
          />
          <View
            className="flex-row items-center justify-between px-5 pt-6 pb-4"
            style={{ borderBottomWidth: 1, borderBottomColor: 'rgba(15,23,42,0.05)' }}
          >
            <View className="flex-row items-center flex-1 pr-3">
              <View
                className="w-9 h-9 rounded-[12px] items-center justify-center mr-3"
                style={{ backgroundColor: 'rgba(37,99,235,0.1)' }}
              >
                <MaterialIcons name={icon} size={17} color={dash.accentBlue} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-semibold" style={{ color: dash.ink }} numberOfLines={1}>
                  {title}
                </Text>
                <Text className="text-[11px] mt-0.5 font-medium" style={{ color: dash.muted }}>
                  {items.length} {items.length === 1 ? 'opțiune' : 'opțiuni'} disponibile
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full items-center justify-center active:opacity-70"
              style={{ backgroundColor: dash.lineSoft }}
            >
              <MaterialIcons name="close" size={15} color={dash.faint} />
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
                  className="dash-row-hover flex-row items-center justify-between py-3 px-3.5 rounded-[13px] mb-1 border active:opacity-80"
                  style={{
                    backgroundColor: isSelected ? 'rgba(37,99,235,0.08)' : 'transparent',
                    borderColor: isSelected ? 'rgba(37,99,235,0.25)' : 'transparent',
                  }}
                >
                  <Text
                    className="text-sm"
                    style={{ color: isSelected ? dash.accentBlue : dash.inkSoft, fontWeight: isSelected ? '700' : '500' }}
                  >
                    {item.label}
                  </Text>
                  {isSelected ? (
                    <View
                      className="w-5 h-5 rounded-full items-center justify-center"
                      style={{ backgroundColor: dash.accentBlue }}
                    >
                      <MaterialIcons name="check" size={12} color="#FFFFFF" />
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

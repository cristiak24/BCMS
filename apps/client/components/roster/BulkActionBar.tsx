import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from '@/src/web/reactNative';
import { Download, Users2, UserX, X } from 'lucide-react';
import { dash } from '../dashboard/dashboardTheme';

interface BulkActionBarProps {
  selectedCount: number;
  busy: boolean;
  onExportCsv: () => void;
  onReassign: () => void;
  onRemove: () => void;
  onClear: () => void;
}

export default function BulkActionBar({ selectedCount, busy, onExportCsv, onReassign, onRemove, onClear }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <View
      className="dash-fade-in mb-4 flex-row flex-wrap items-center justify-between gap-3 rounded-[20px] border px-4 py-3"
      style={{ backgroundColor: 'rgba(37,99,235,0.06)', borderColor: 'rgba(37,99,235,0.18)' }}
    >
      <View className="flex-row items-center gap-2">
        <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: dash.accentBlue }}>
          <Text className="text-[12px] font-black text-white">{selectedCount}</Text>
        </View>
        <Text className="text-[13px] font-black" style={{ color: dash.ink }}>
          {selectedCount === 1 ? 'sportiv selectat' : 'sportivi selectați'}
        </Text>
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {busy ? <ActivityIndicator size="small" color={dash.accentBlue} /> : null}

        <Pressable
          onPress={onExportCsv}
          disabled={busy}
          className="dash-btn-hover flex-row items-center gap-1.5 rounded-[12px] border px-3 py-2"
          style={{ backgroundColor: dash.surface, borderColor: dash.hairline, opacity: busy ? 0.6 : 1 }}
        >
          <Download color={dash.inkSoft} size={14} />
          <Text className="text-[12px] font-bold" style={{ color: dash.inkSoft }}>
            Exportă CSV
          </Text>
        </Pressable>

        <Pressable
          onPress={onReassign}
          disabled={busy}
          className="dash-btn-hover flex-row items-center gap-1.5 rounded-[12px] border px-3 py-2"
          style={{ backgroundColor: dash.surface, borderColor: dash.hairline, opacity: busy ? 0.6 : 1 }}
        >
          <Users2 color={dash.accentBlue} size={14} />
          <Text className="text-[12px] font-bold" style={{ color: dash.accentBlue }}>
            Mută la echipă
          </Text>
        </Pressable>

        <Pressable
          onPress={onRemove}
          disabled={busy}
          className="dash-btn-hover flex-row items-center gap-1.5 rounded-[12px] border px-3 py-2"
          style={{ backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)', opacity: busy ? 0.6 : 1 }}
        >
          <UserX color={dash.dangerDeep} size={14} />
          <Text className="text-[12px] font-bold" style={{ color: dash.dangerDeep }}>
            Elimină din club
          </Text>
        </Pressable>

        <Pressable onPress={onClear} disabled={busy} className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: dash.lineSoft }}>
          <X color={dash.faint} size={14} />
        </Pressable>
      </View>
    </View>
  );
}

import React from 'react';
import { Image, Pressable, Text, View } from '@/src/web/reactNative';
import { CheckCircle2, CircleAlert, Pencil } from 'lucide-react';
import { Player } from '../../services/teamsApi';
import { dash } from '../dashboard/dashboardTheme';
import AttendanceBar from './AttendanceBar';
import StatusBadge from './StatusBadge';
import RosterCheckbox from './RosterCheckbox';

interface RosterPlayerCardProps {
  player: Player;
  categoryLabel: string;
  attendanceRate: number;
  paymentLabel: string;
  paymentPaid: boolean;
  isActive: boolean;
  showStatusChip: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPress: () => void;
  onEdit: () => void;
}

export default function RosterPlayerCard({
  player,
  categoryLabel,
  attendanceRate,
  paymentLabel,
  paymentPaid,
  isActive,
  showStatusChip,
  selected,
  onToggleSelect,
  onPress,
  onEdit,
}: RosterPlayerCardProps) {
  const fullName = `${player.firstName || 'Necunoscut'} ${player.lastName || 'Sportiv'}`.trim();
  const teamLabel = player.teamName || player.teamNames?.[0] || 'Neasignat';
  const initials = `${player.firstName?.[0] || 'P'}${player.lastName?.[0] || ''}`.toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      className="dash-card dash-fade-in rounded-[22px] border p-4"
      style={{
        backgroundColor: dash.surface,
        borderColor: selected ? 'rgba(37,99,235,0.35)' : dash.hairline,
        ...dash.shadow.sm,
      }}
    >
      <View className="flex-row items-center">
        <View className="mr-3">
          <RosterCheckbox checked={selected} onToggle={onToggleSelect} accessibilityLabel={`Selectează ${fullName}`} />
        </View>

        <View
          className="h-12 w-12 items-center justify-center rounded-[16px] border overflow-hidden"
          style={{ backgroundColor: 'rgba(37,99,235,0.08)', borderColor: dash.hairline }}
        >
          {player.avatarUrl ? (
            <Image source={{ uri: player.avatarUrl }} className="h-full w-full" />
          ) : (
            <Text className="text-[15px] font-black" style={{ color: dash.accentBlue }}>
              {initials}
            </Text>
          )}
        </View>

        <View className="ml-3 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-[15px] font-black" style={{ color: dash.ink }} numberOfLines={1}>
              {fullName}
            </Text>
            {showStatusChip ? <StatusBadge label={isActive ? 'Activ' : 'Inactiv'} tone={isActive ? 'green' : 'gray'} /> : null}
          </View>
          <Text className="mt-0.5 text-[12px] font-bold" style={{ color: dash.faint }} numberOfLines={1}>
            {player.number ? `#${player.number}` : 'Fără tricou'} • {teamLabel}
          </Text>
        </View>

        <Pressable
          onPress={(event: any) => {
            event.stopPropagation();
            onEdit();
          }}
          className="h-9 w-9 items-center justify-center rounded-[13px] border"
          style={{ backgroundColor: dash.surfaceSubtle, borderColor: dash.hairline }}
        >
          <Pencil color={dash.muted} size={16} />
        </Pressable>
      </View>

      <View className="mt-4 flex-row gap-3">
        <View className="flex-1 rounded-[16px] p-3" style={{ backgroundColor: dash.surfaceSubtle }}>
          <Text className="text-[9px] font-black uppercase tracking-[1.1px]" style={{ color: dash.faint }}>
            Poziție
          </Text>
          <Text className="mt-1 text-[13px] font-bold" style={{ color: dash.inkSoft }} numberOfLines={1}>
            {player.position || 'Sportiv'}
          </Text>
        </View>
        <View className="flex-1 rounded-[16px] p-3" style={{ backgroundColor: dash.surfaceSubtle }}>
          <Text className="text-[9px] font-black uppercase tracking-[1.1px]" style={{ color: dash.faint }}>
            Categorie
          </Text>
          <StatusBadge label={categoryLabel} tone="blue" />
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[9px] font-black uppercase tracking-[1.1px]" style={{ color: dash.faint }}>
            Prezență
          </Text>
          <Text className="mt-1 text-[13px] font-black" style={{ color: dash.ink }}>
            {attendanceRate}%
          </Text>
          <View className="mt-1.5">
            <AttendanceBar value={attendanceRate} />
          </View>
        </View>

        <View
          className="flex-row items-center gap-1.5 rounded-full px-3 py-2"
          style={{ backgroundColor: dash.surfaceSubtle }}
        >
          {paymentPaid ? (
            <CheckCircle2 color={dash.successDeep} size={15} />
          ) : (
            <CircleAlert color={dash.dangerDeep} size={15} />
          )}
          <Text
            className="text-[12px] font-black"
            style={{ color: paymentPaid ? dash.successDeep : dash.dangerDeep }}
          >
            {paymentLabel}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

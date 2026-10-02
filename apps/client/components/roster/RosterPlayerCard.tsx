import React from 'react';
import { Image, Pressable, Text, View } from '@/src/web/reactNative';
import { MoreHorizontal } from 'lucide-react';
import { Player } from '../../services/teamsApi';
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
  const teamLabel = player.teamName || player.teamNames?.[0] || 'Fără echipă';
  const initials = `${player.firstName?.[0] || 'P'}${player.lastName?.[0] || ''}`.toUpperCase();
  const payTone = paymentPaid
    ? { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' }
    : paymentLabel === 'Restanță'
      ? { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)' }
      : { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' };
  const attendanceTone = attendanceRate >= 75 ? 'var(--c-success-fg)' : attendanceRate >= 60 ? 'var(--c-warning-fg)' : 'var(--c-danger-fg)';
  const meta = [player.number ? `#${player.number}` : null, player.position, teamLabel].filter(Boolean).join(' · ');
  void categoryLabel;

  // Two lines per player: identity, then attendance + payment. It used to be
  // ~190px of labelled sub-cards (POZIȚIE / CATEGORIE / PREZENȚĂ) per player.
  return (
    <Pressable
      onPress={onPress}
      className="rounded-[14px] border px-3 py-3 text-left"
      style={{
        backgroundColor: selected ? 'var(--c-surface-tint)' : 'var(--c-surface)',
        borderColor: selected ? 'var(--c-brand-border)' : 'var(--c-border)',
      } as any}
    >
      <View className="flex-row items-center gap-3">
        <RosterCheckbox checked={selected} onToggle={onToggleSelect} accessibilityLabel={`Selectează ${fullName}`} />
        <View className="h-10 w-10 items-center justify-center rounded-full overflow-hidden shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
          {player.avatarUrl ? (
            <Image source={{ uri: player.avatarUrl }} className="h-full w-full" />
          ) : (
            <Text className="text-[13px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{initials}</Text>
          )}
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 min-w-0">
            <Text className="text-[14.5px] font-semibold shrink" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{fullName}</Text>
            {showStatusChip && !isActive ? <StatusBadge label="Inactiv" tone="gray" /> : null}
          </View>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{meta}</Text>
        </View>
        <Pressable
          onPress={(event: any) => {
            event.stopPropagation();
            onEdit();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Acțiuni pentru ${fullName}`}
          className="h-8 w-8 items-center justify-center rounded-[9px] shrink-0"
        >
          <MoreHorizontal color="var(--c-muted)" size={18} />
        </Pressable>
      </View>

      <View className="mt-2.5 flex-row items-center gap-3 pl-[30px]">
        <Text className="t-num text-[12.5px] font-bold w-[38px]" style={{ color: attendanceTone }}>{attendanceRate}%</Text>
        <View className="flex-1 min-w-0">
          <AttendanceBar value={attendanceRate} />
        </View>
        <View className="flex-row items-center gap-1.5 rounded-full px-2.5 py-1 shrink-0" style={{ backgroundColor: payTone.bg }}>
          <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: payTone.fg }} />
          <Text className="text-[11.5px] font-semibold" style={{ color: payTone.fg }} numberOfLines={1}>{paymentLabel}</Text>
        </View>
      </View>
    </Pressable>
  );
}

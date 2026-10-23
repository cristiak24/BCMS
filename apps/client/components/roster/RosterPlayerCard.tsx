import React from 'react';
import { Image, Pressable, Text, View } from '@/src/web/reactNative';
import { MoreHorizontal } from 'lucide-react';
import { Player } from '../../services/teamsApi';
import StatusBadge from './StatusBadge';
import RosterCheckbox from './RosterCheckbox';
import { DenseRow } from '../ui/DenseList';
import { MEDICAL_META, medicalStatus } from '../myclub/teamDisplay';

interface RosterPlayerCardProps {
  player: Player;
  categoryLabel: string;
  /** Last 30 days; null = nothing marked in the period. */
  attendanceRate: number | null;
  paymentLabel: string;
  paymentPaid: boolean;
  isActive: boolean;
  showStatusChip: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onPress: () => void;
  onEdit: () => void;
}

/**
 * One player on the phone roster: a row of a DenseList, not a card. It used
 * to be a bordered card per player with an attendance bar on a second line,
 * which drew "no data" as a red 0% bar; attendance is now text in the meta
 * line, „—” when nothing was marked.
 */
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
      : { bg: 'var(--c-surface-3)', fg: 'var(--c-ink-soft)' }; // „De plată”: owed, not late
  const attendanceTone = attendanceRate == null ? 'var(--c-faint)' : attendanceRate >= 75 ? 'var(--c-success-fg)' : attendanceRate >= 60 ? 'var(--c-warning-fg)' : 'var(--c-danger-fg)';
  const meta = [player.number ? `#${player.number}` : null, teamLabel].filter(Boolean).join(' · ');
  const medicalMeta = MEDICAL_META[medicalStatus(player.medicalCheckExpiry)];
  void categoryLabel;

  return (
    <DenseRow selected={selected}>
      <RosterCheckbox checked={selected} onToggle={onToggleSelect} accessibilityLabel={`Selectează ${fullName}`} />
      <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={fullName} className="flex-1 min-w-0 flex-row items-center gap-2.5 text-left">
        {/* No avatar on a phone: the initials repeat the name and cost the width the name needs. */}
        <View aria-hidden className="hidden sm:flex h-9 w-9 items-center justify-center rounded-full overflow-hidden shrink-0" style={{ backgroundColor: 'var(--c-surface-3)' }}>
          {player.avatarUrl ? (
            <Image source={{ uri: player.avatarUrl }} className="h-full w-full" />
          ) : (
            <Text className="text-[12px] font-bold" style={{ color: 'var(--c-ink-soft)' }}>{initials}</Text>
          )}
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2 min-w-0">
            <Text className="flex-1 min-w-0 text-[14px] font-semibold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{fullName}</Text>
            {showStatusChip && !isActive ? <StatusBadge label="Inactiv" tone="gray" /> : null}
          </View>
          <Text className="t-meta" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
            {meta} · <Text className="t-num" style={{ color: attendanceTone }}>{attendanceRate == null ? 'prezență —' : `${attendanceRate}% prezență`}</Text>
          </Text>
          {/* Payment and clearance under the name, like the team page: on a phone the
              clearance column was simply gone, so nobody could see who may play. */}
          <View className="flex-row flex-wrap items-center gap-1.5 mt-1">
            <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: payTone.bg }}>
              <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: payTone.fg }} />
              <Text className="text-[11.5px] font-semibold" style={{ color: payTone.fg }} numberOfLines={1}>{paymentLabel}</Text>
            </View>
            <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: medicalMeta.bg }}>
              <Text className="text-[11.5px] font-semibold" style={{ color: medicalMeta.fg }} numberOfLines={1}>{medicalMeta.label}</Text>
            </View>
          </View>
        </View>
      </Pressable>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Acțiuni pentru ${fullName}`}
        className="tap-40 h-10 w-8 -mr-1.5 items-center justify-center rounded-[9px] shrink-0"
      >
        <MoreHorizontal color="var(--c-muted)" size={18} />
      </Pressable>
    </DenseRow>
  );
}

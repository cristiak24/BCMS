import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from '@/src/web/reactNative';
import { MoreHorizontal } from 'lucide-react';
import { Player } from '../../services/teamsApi';
import AttendanceBar from './AttendanceBar';
import StatusBadge from './StatusBadge';
import RosterCheckbox from './RosterCheckbox';
import { ROSTER_COLUMN_FLEX, ROSTER_COLUMN_WIDTHS, ROSTER_TABLE_WIDTH } from './rosterTableLayout';

interface PlayerRowProps {
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

export default function PlayerRow({
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
}: PlayerRowProps) {
  const fullName = `${player.firstName || 'Necunoscut'} ${player.lastName || 'Sportiv'}`.trim();
  const subtitle = `${player.number ? `#${player.number}` : 'Fără tricou'} • ${player.teamName || player.teamNames?.[0] || 'Neasignat'}`;
  const initials = `${player.firstName?.[0] || 'P'}${player.lastName?.[0] || ''}`.toUpperCase();

  const payTone = paymentPaid
    ? { bg: 'var(--c-success-bg)', fg: 'var(--c-success-fg)' }
    : paymentLabel === 'Restanță'
      ? { bg: 'var(--c-danger-bg)', fg: 'var(--c-danger-fg)' }
      : { bg: 'var(--c-warning-bg)', fg: 'var(--c-warning-fg)' };
  const attendanceTone = attendanceRate >= 75 ? 'var(--c-success-fg)' : attendanceRate >= 60 ? 'var(--c-warning-fg)' : 'var(--c-danger-fg)';
  const unassigned = !categoryLabel || /neasignat/i.test(categoryLabel);

  // A table row, not a floating card: the list used to be eight separate
  // 22px-radius cards with "ROL" / "SĂPTĂMÂNAL" captions over every value.
  return (
    <Pressable
      onPress={onPress}
      className="hover:bg-[var(--c-surface-2)]"
      style={[styles.row, selected && { backgroundColor: 'var(--c-surface-tint)' }] as any}
    >
      <View style={styles.mainRow}>
        <View style={styles.selectCell}>
          <RosterCheckbox checked={selected} onToggle={onToggleSelect} accessibilityLabel={`Selectează ${fullName}`} />
        </View>

        <View style={styles.playerCell}>
          <View style={styles.avatar}>
            {player.avatarUrl ? (
              <Image source={{ uri: player.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.initials}>{initials}</Text>
            )}
          </View>
          <View style={styles.playerTextWrap}>
            <View className="flex-row items-center gap-2 min-w-0">
              <Text style={styles.name} numberOfLines={1}>{fullName}</Text>
              {showStatusChip && !isActive ? <StatusBadge label="Inactiv" tone="gray" /> : null}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.positionCell}>
          <Text style={styles.position} numberOfLines={1}>{player.position || '—'}</Text>
        </View>

        <View style={styles.categoryCell}>
          {unassigned ? <Text style={styles.muted}>—</Text> : <StatusBadge label={categoryLabel} tone="blue" />}
        </View>

        <View style={styles.attendanceCell}>
          <Text style={[styles.attendanceText, { color: attendanceTone }] as any}>{attendanceRate}%</Text>
          <View style={styles.barWrap}>
            <AttendanceBar value={attendanceRate} />
          </View>
        </View>

        <View style={styles.paymentCell}>
          <View style={[styles.paymentPill, { backgroundColor: payTone.bg }] as any}>
            <View style={[styles.dot, { backgroundColor: payTone.fg }] as any} />
            <Text style={[styles.paymentText, { color: payTone.fg }] as any} numberOfLines={1}>{paymentLabel}</Text>
          </View>
        </View>

        <View style={styles.actionsCell}>
          <Pressable
            onPress={(event: any) => {
              event.stopPropagation();
              onEdit();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Acțiuni pentru ${fullName}`}
            className="ui-press hover:bg-[var(--c-surface-3)]"
            style={styles.editButton}
          >
            <MoreHorizontal color="var(--c-muted)" size={18} />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'var(--c-border)',
  },
  mainRow: {
    width: '100%',
    minWidth: ROSTER_TABLE_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectCell: {
    width: ROSTER_COLUMN_WIDTHS.select,
    minWidth: ROSTER_COLUMN_WIDTHS.select,
    flexShrink: 0,
  },
  playerCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.player,
    flexGrow: ROSTER_COLUMN_FLEX.player,
    flexBasis: 0,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'var(--c-surface-tint)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  initials: {
    color: 'var(--c-brand-fg)',
    fontSize: 12,
    fontWeight: '700',
  },
  playerTextWrap: {
    marginLeft: 12,
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: 'var(--c-ink)',
  },
  subtitle: {
    marginTop: 1,
    fontSize: 12,
    color: 'var(--c-muted)',
    fontWeight: '500',
  },
  muted: {
    fontSize: 13,
    color: 'var(--c-faint)',
  },
  positionCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.position,
    flexGrow: ROSTER_COLUMN_FLEX.position,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 12,
    justifyContent: 'center',
  },
  position: {
    fontSize: 13,
    fontWeight: '500',
    color: 'var(--c-ink-soft)',
  },
  categoryCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.category,
    flexGrow: ROSTER_COLUMN_FLEX.category,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 22,
    justifyContent: 'center',
  },
  attendanceCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.attendance,
    flexGrow: ROSTER_COLUMN_FLEX.attendance,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 22,
    alignItems: 'flex-start',
  },
  attendanceText: {
    fontSize: 13,
    fontWeight: '700',
  },
  barWrap: {
    marginTop: 5,
  },
  paymentCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.payment,
    flexGrow: ROSTER_COLUMN_FLEX.payment,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 12,
    justifyContent: 'center',
  },
  paymentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  paymentText: {
    fontSize: 12,
    fontWeight: '600',
    whiteSpace: 'nowrap',
  } as any,
  actionsCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.actions,
    width: ROSTER_COLUMN_WIDTHS.actions,
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

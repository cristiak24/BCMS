import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from '@/src/web/reactNative';
import { CheckCircle2, CircleAlert, Pencil } from 'lucide-react';
import { Player } from '../../services/teamsApi';
import { dash } from '../dashboard/dashboardTheme';
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

  return (
    <Pressable onPress={onPress} className="dash-card dash-card-hover" style={[styles.card, selected && styles.cardSelected]}>
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
            <View className="flex-row items-center gap-2">
              <Text style={styles.name} numberOfLines={1}>
                {fullName}
              </Text>
              {showStatusChip ? <StatusBadge label={isActive ? 'Activ' : 'Inactiv'} tone={isActive ? 'green' : 'gray'} /> : null}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </View>

        <View style={styles.positionCell}>
          <Text style={styles.cellLabel}>Rol</Text>
          <Text style={styles.position} numberOfLines={2}>
            {player.position || 'Sportiv'}
          </Text>
        </View>

        <View style={styles.categoryCell}>
          <StatusBadge label={categoryLabel} tone="blue" />
        </View>

        <View style={styles.attendanceCell}>
          <Text style={styles.cellLabel}>Săptămânal</Text>
          <Text style={styles.attendanceText}>{attendanceRate}% prezență</Text>
          <View style={styles.barWrap}>
            <AttendanceBar value={attendanceRate} />
          </View>
        </View>

        <View style={styles.paymentCell}>
          <View style={styles.paymentRow}>
            {paymentPaid ? (
              <CheckCircle2 color={dash.successDeep} size={16} />
            ) : (
              <CircleAlert color={dash.dangerDeep} size={16} />
            )}
            <Text style={[styles.paymentText, paymentPaid ? styles.paymentPaid : styles.paymentPending]}>
              {paymentLabel}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={(event: any) => {
            event.stopPropagation();
            onEdit();
          }}
          style={styles.editButton}
        >
          <Pencil color={dash.muted} size={18} />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: dash.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: dash.hairline,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...dash.shadow.sm,
  },
  cardSelected: {
    borderColor: 'rgba(37,99,235,0.35)',
    backgroundColor: 'rgba(37,99,235,0.03)',
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
    width: 52,
    height: 52,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(37,99,235,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: dash.hairline,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  initials: {
    color: dash.accentBlue,
    fontSize: 16,
    fontWeight: '900',
  },
  playerTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    color: dash.ink,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: dash.faint,
    fontWeight: '700',
  },
  cellLabel: {
    marginBottom: 3,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: dash.faint,
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
    fontSize: 14,
    fontWeight: '800',
    color: dash.inkSoft,
    lineHeight: 20,
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
    fontWeight: '900',
    color: dash.ink,
  },
  barWrap: {
    marginTop: 6,
  },
  paymentCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.payment,
    flexGrow: ROSTER_COLUMN_FLEX.payment,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 22,
    justifyContent: 'center',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: dash.surfaceSubtle,
  },
  paymentText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '900',
  },
  paymentPaid: {
    color: dash.successDeep,
  },
  paymentPending: {
    color: dash.dangerDeep,
  },
  editButton: {
    minWidth: ROSTER_COLUMN_WIDTHS.actions,
    width: 44,
    flexShrink: 0,
    height: 40,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: dash.hairline,
    backgroundColor: dash.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

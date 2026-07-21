import React from 'react';
import { Pressable, StyleSheet, Text, View } from '@/src/web/reactNative';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { dash } from '../dashboard/dashboardTheme';
import RosterCheckbox from './RosterCheckbox';
import { ROSTER_COLUMN_FLEX, ROSTER_COLUMN_WIDTHS, ROSTER_TABLE_WIDTH, RosterSortColumn, RosterSortDirection } from './rosterTableLayout';

interface RosterTableHeaderProps {
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelectAll: () => void;
  sortColumn: RosterSortColumn | null;
  sortDirection: RosterSortDirection;
  onSort: (column: RosterSortColumn) => void;
}

function SortableLabel({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
}: {
  label: string;
  column: RosterSortColumn;
  sortColumn: RosterSortColumn | null;
  sortDirection: RosterSortDirection;
  onSort: (column: RosterSortColumn) => void;
}) {
  const active = sortColumn === column;
  return (
    <Pressable onPress={() => onSort(column)} className="flex-row items-center gap-1">
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      {active ? (
        sortDirection === 'asc' ? (
          <ChevronUp color={dash.accentBlue} size={13} />
        ) : (
          <ChevronDown color={dash.accentBlue} size={13} />
        )
      ) : null}
    </Pressable>
  );
}

export default function RosterTableHeader({
  allSelected,
  someSelected,
  onToggleSelectAll,
  sortColumn,
  sortDirection,
  onSort,
}: RosterTableHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.selectCell}>
        <RosterCheckbox
          checked={allSelected}
          indeterminate={!allSelected && someSelected}
          onToggle={onToggleSelectAll}
          accessibilityLabel="Selectează toți sportivii de pe pagină"
        />
      </View>
      <View style={styles.playerCell}>
        <SortableLabel label="Sportiv" column="name" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </View>
      <Text style={[styles.label, styles.positionCell]}>Poziție</Text>
      <Text style={[styles.label, styles.categoryCell]}>Categorie</Text>
      <View style={styles.attendanceCell}>
        <SortableLabel label="Prezență" column="attendance" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </View>
      <View style={styles.paymentCell}>
        <SortableLabel label="Plată" column="payment" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </View>
      <Text style={[styles.label, styles.actionsCell]}>Acțiuni</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minWidth: ROSTER_TABLE_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: dash.hairline,
    backgroundColor: dash.surfaceSubtle,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: dash.faint,
  },
  labelActive: {
    color: dash.accentBlue,
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
    paddingRight: 12,
  },
  positionCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.position,
    flexGrow: ROSTER_COLUMN_FLEX.position,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 12,
  },
  categoryCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.category,
    flexGrow: ROSTER_COLUMN_FLEX.category,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 22,
  },
  attendanceCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.attendance,
    flexGrow: ROSTER_COLUMN_FLEX.attendance,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 22,
  },
  paymentCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.payment,
    flexGrow: ROSTER_COLUMN_FLEX.payment,
    flexBasis: 0,
    flexShrink: 0,
    paddingRight: 22,
  },
  actionsCell: {
    width: ROSTER_COLUMN_WIDTHS.actions,
    minWidth: ROSTER_COLUMN_WIDTHS.actions,
    flexShrink: 0,
  },
});

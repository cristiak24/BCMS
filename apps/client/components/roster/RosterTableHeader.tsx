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
  // Not a <table>, so no aria-sort: the name carries the state („Sortează după
  // Prezență, crescător”); 32px tall instead of the 17px label.
  const state = active ? (sortDirection === 'asc' ? 'crescător' : 'descrescător') : 'nesortat';
  return (
    <Pressable
      onPress={() => onSort(column)}
      accessibilityLabel={`Sortează după ${label}, ${state}`}
      className="flex-row items-center gap-1 h-8 -my-2 pr-1"
    >
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
          accessibilityLabel="Selectează toți jucătorii de pe pagină"
        />
      </View>
      <View style={styles.playerCell}>
        <SortableLabel label="Jucător" column="name" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </View>
      {/* Viza medicală instead of "Poziție" (never filled in anywhere) and
          "Categorie" (it repeated the team shown under the name). */}
      {/* Sortable: who can't play (no visa, then the earliest expiry) is what the admin triages. */}
      <View style={styles.medicalCell}>
        <SortableLabel label="Viză medicală" column="medical" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </View>
      <View style={styles.attendanceCell}>
        <SortableLabel label="Prezență" column="attendance" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </View>
      <View style={styles.paymentCell}>
        <SortableLabel label="Plată" column="payment" sortColumn={sortColumn} sortDirection={sortDirection} onSort={onSort} />
      </View>
      <View style={styles.actionsCell} />
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
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: dash.hairline,
    backgroundColor: 'var(--c-surface-2)',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
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
  medicalCell: {
    minWidth: ROSTER_COLUMN_WIDTHS.medical,
    flexGrow: ROSTER_COLUMN_FLEX.medical,
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

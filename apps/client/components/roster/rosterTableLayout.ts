export const ROSTER_COLUMN_WIDTHS = {
  select: 44,
  player: 240,
  position: 120,
  category: 150,
  attendance: 156,
  payment: 116,
  actions: 84,
} as const;

export const ROSTER_COLUMN_FLEX = {
  player: 2.4,
  position: 1.2,
  category: 1.3,
  attendance: 1.4,
  payment: 1.1,
} as const;

export const ROSTER_TABLE_WIDTH =
  ROSTER_COLUMN_WIDTHS.select +
  ROSTER_COLUMN_WIDTHS.player +
  ROSTER_COLUMN_WIDTHS.position +
  ROSTER_COLUMN_WIDTHS.category +
  ROSTER_COLUMN_WIDTHS.attendance +
  ROSTER_COLUMN_WIDTHS.payment +
  ROSTER_COLUMN_WIDTHS.actions;

export type RosterSortColumn = 'name' | 'attendance' | 'payment';
export type RosterSortDirection = 'asc' | 'desc';

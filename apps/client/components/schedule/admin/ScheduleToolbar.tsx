import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from '@/src/web/reactNative';
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, CalendarDays, Download, RotateCw,
  SlidersHorizontal, X, Search,
} from 'lucide-react';
import { EVENT_TYPE_META } from '../scheduleShared';
import type { EventType } from '../scheduleShared';

/*
 * The schedule's control surface, in ONE row.
 *
 * It previously took four stacked rows before a single day of the calendar was
 * visible: a 44px page title, a month line, a row of five type pills, then a
 * view switcher sitting next to a five-item colour legend. On a phone that was
 * ~380px of chrome — more than half the viewport — above the thing the user
 * came for.
 *
 * Three consolidations get it down to one row (two on mobile):
 *
 *   • The page title is dropped. The app shell's header already names the
 *     section; "Programul meu" restated it at 44px.
 *   • The legend is MERGED INTO the type filters. Both encoded the same five
 *     event types with the same five colours — one as a filter, one as a key.
 *     Putting the colour dot on the filter chip makes a single control do both
 *     jobs, and removes a row that could never be interacted with.
 *   • The month label and its arrows move here from the calendar card's own
 *     header, which was duplicating the month name and event count already
 *     shown above it.
 */

export type ScheduleView = 'month' | 'week' | 'agenda';

const VIEW_OPTIONS: { key: ScheduleView; icon: typeof LayoutGrid; label: string }[] = [
  { key: 'month', icon: LayoutGrid, label: 'Lună' },
  { key: 'week', icon: CalendarDays, label: 'Săptămână' },
  { key: 'agenda', icon: List, label: 'Agendă' },
];

const TYPE_ORDER: EventType[] = ['match', 'training', 'camp', 'medical', 'admin'];

/** Compact icon button used for the secondary actions (export / sync / filters). */
function IconButton({
  onPress, label, disabled, badge, active, children,
}: {
  onPress: () => void;
  label: string;
  disabled?: boolean;
  badge?: number;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className={`relative w-9 h-9 rounded-[10px] items-center justify-center border ${
        active
          ? 'bg-[var(--c-surface-tint)] border-[var(--c-brand-border)]'
          : 'bg-[var(--c-surface)] border-[var(--c-border)]'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      {children}
      {badge ? (
        <View
          className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full items-center justify-center"
          style={{ backgroundColor: 'var(--c-brand-surface)' }}
        >
          <Text className="text-[9px] font-bold" style={{ color: 'var(--c-on-brand)' }}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function ScheduleToolbar({
  monthLabel,
  year,
  eventCount,
  onNavigateMonth,
  onToday,
  view,
  onViewChange,
  filterType,
  onFilterTypeChange,
  typeCounts,
  activeFilterCount,
  onOpenFilters,
  onExport,
  onSync,
  syncing,
  isMobile,
  scopedTeamName,
  onClearTeam,
  searchValue,
  onClearSearch,
}: {
  monthLabel: string;
  year: number;
  eventCount: number;
  onNavigateMonth: (delta: number) => void;
  onToday: () => void;
  view: ScheduleView;
  onViewChange: (view: ScheduleView) => void;
  filterType: string | null;
  onFilterTypeChange: (value: string | null) => void;
  typeCounts: Record<string, number>;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onExport: () => void;
  onSync: () => void;
  syncing: boolean;
  isMobile: boolean;
  scopedTeamName: string | null;
  onClearTeam: () => void;
  searchValue: string;
  onClearSearch: () => void;
}) {
  const monthTitle = `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} ${year}`;

  // ── Month stepper ──────────────────────────────────────────────────────
  const monthNav = (
    <View className="flex-row items-center gap-1">
      <TouchableOpacity
        onPress={() => onNavigateMonth(-1)}
        accessibilityLabel="Luna anterioară"
        className="w-8 h-8 rounded-[9px] items-center justify-center border border-[var(--c-border)] bg-[var(--c-surface)]"
      >
        <ChevronLeft size={16} color="var(--c-ink-soft)" />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onToday}
        accessibilityLabel="Mergi la luna curentă"
        className="px-2.5 h-8 justify-center"
      >
        {/* min-width keeps the arrows from shifting as the month name changes
            length ("mai" vs "septembrie"). */}
        <Text
          className="text-[15px] font-bold tracking-tight"
          style={{ color: 'var(--c-ink)', minWidth: isMobile ? 118 : 132 } as any}
          numberOfLines={1}
        >
          {monthTitle}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onNavigateMonth(1)}
        accessibilityLabel="Luna următoare"
        className="w-8 h-8 rounded-[9px] items-center justify-center border border-[var(--c-border)] bg-[var(--c-surface)]"
      >
        <ChevronRight size={16} color="var(--c-ink-soft)" />
      </TouchableOpacity>
    </View>
  );

  // ── View switcher — icon-only on mobile, icon+label on desktop ─────────
  const viewSwitcher = (
    <View
      className="flex-row items-center rounded-[10px] p-[3px] gap-[2px]"
      style={{ backgroundColor: 'var(--c-surface-3)' }}
    >
      {VIEW_OPTIONS.map(({ key, icon: Icon, label }) => {
        const active = view === key;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onViewChange(key)}
            accessibilityLabel={label}
            className={`flex-row items-center gap-1.5 h-[28px] rounded-[8px] justify-center ${
              isMobile ? 'w-9' : 'px-2.5'
            }`}
            style={active ? { backgroundColor: 'var(--c-surface)', boxShadow: 'var(--e-xs)' } as any : undefined}
          >
            <Icon size={14} color={active ? 'var(--c-brand-fg)' : 'var(--c-muted)'} />
            {!isMobile && (
              <Text
                className="text-[12px] font-semibold"
                style={{ color: active ? 'var(--c-ink)' : 'var(--c-muted)' }}
              >
                {label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Type filters, doubling as the calendar's colour key ────────────────
  const typeChips = (
    <View className="flex-row items-center gap-1.5">
      <TouchableOpacity
        onPress={() => onFilterTypeChange(null)}
        className={`h-8 px-3 rounded-[9px] justify-center border ${
          filterType === null
            ? 'border-transparent'
            : 'border-[var(--c-border)] bg-[var(--c-surface)]'
        }`}
        style={filterType === null ? { backgroundColor: 'var(--c-brand-surface)' } : undefined}
      >
        <Text
          className="text-[12px] font-semibold"
          style={{ color: filterType === null ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}
        >
          Toate
        </Text>
      </TouchableOpacity>

      {TYPE_ORDER.map((type) => {
        const meta = EVENT_TYPE_META[type];
        const active = filterType === type;
        const count = typeCounts[type] ?? 0;
        return (
          <TouchableOpacity
            key={type}
            onPress={() => onFilterTypeChange(active ? null : type)}
            className={`flex-row items-center gap-1.5 h-8 px-2.5 rounded-[9px] border ${
              active ? 'border-transparent' : 'border-[var(--c-border)] bg-[var(--c-surface)]'
            }`}
            style={active ? { backgroundColor: meta.solid } : undefined}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                backgroundColor: active ? 'var(--c-on-brand)' : meta.solid,
              }}
            />
            <Text
              className="text-[12px] font-semibold"
              style={{ color: active ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}
              numberOfLines={1}
            >
              {meta.label}
            </Text>
            {count > 0 && (
              <Text
                className="text-[11px] font-semibold"
                style={{ color: active ? 'rgba(255,255,255,0.75)' : 'var(--c-faint)' }}
              >
                {count}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const actions = (
    <View className="flex-row items-center gap-1.5">
      <IconButton
        onPress={onOpenFilters}
        label="Filtre avansate"
        badge={activeFilterCount || undefined}
        active={activeFilterCount > 0}
      >
        <SlidersHorizontal
          size={15}
          color={activeFilterCount > 0 ? 'var(--c-brand-fg)' : 'var(--c-muted)'}
        />
      </IconButton>
      <IconButton onPress={onExport} label="Exportă luna (.ics)">
        <Download size={15} color="var(--c-muted)" />
      </IconButton>
      <IconButton onPress={onSync} label="Sincronizează meciurile FRB" disabled={syncing}>
        <RotateCw size={15} color="var(--c-muted)" />
      </IconButton>
    </View>
  );

  // Applied-filter pills. Only rendered when something is actually scoping the
  // view, so the row costs nothing in the common case.
  const activePills = (scopedTeamName || searchValue) ? (
    <View className="flex-row items-center flex-wrap gap-1.5 mt-2">
      {scopedTeamName ? (
        <View
          className="flex-row items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-[8px]"
          style={{ backgroundColor: 'var(--c-surface-tint)' }}
        >
          <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>
            {scopedTeamName}
          </Text>
          <TouchableOpacity onPress={onClearTeam} accessibilityLabel="Elimină filtrul de echipă" className="p-0.5">
            <X size={12} color="var(--c-brand-fg)" />
          </TouchableOpacity>
        </View>
      ) : null}
      {searchValue ? (
        <View
          className="flex-row items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-[8px]"
          style={{ backgroundColor: 'var(--c-surface-3)' }}
        >
          <Search size={11} color="var(--c-muted)" />
          <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>
            {searchValue}
          </Text>
          <TouchableOpacity onPress={onClearSearch} accessibilityLabel="Golește căutarea" className="p-0.5">
            <X size={12} color="var(--c-muted)" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  ) : null;

  if (isMobile) {
    return (
      <View>
        <View className="flex-row items-center justify-between gap-2">
          {monthNav}
          <View className="flex-row items-center gap-1.5">
            {viewSwitcher}
            <IconButton
              onPress={onOpenFilters}
              label="Filtre"
              badge={activeFilterCount || undefined}
              active={activeFilterCount > 0}
            >
              <SlidersHorizontal
                size={15}
                color={activeFilterCount > 0 ? 'var(--c-brand-fg)' : 'var(--c-muted)'}
              />
            </IconButton>
          </View>
        </View>

        {/* Horizontal scroll rather than wrap: five chips wrapped onto three
            lines on a 390px phone, and a wrapping filter row makes the content
            below jump every time a filter changes. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-2.5 -mx-4"
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {typeChips}
        </ScrollView>

        {activePills}
      </View>
    );
  }

  return (
    <View>
      <View className="flex-row items-center gap-3 flex-wrap">
        {monthNav}

        <Text className="text-[12px] font-medium" style={{ color: 'var(--c-faint)' }}>
          {eventCount} {eventCount === 1 ? 'eveniment' : 'evenimente'}
        </Text>

        <View className="w-px h-6" style={{ backgroundColor: 'var(--c-border)' }} />

        {typeChips}

        <View className="ml-auto flex-row items-center gap-2">
          {viewSwitcher}
          {actions}
        </View>
      </View>
      {activePills}
    </View>
  );
}

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from '@/src/web/reactNative';
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, CalendarDays, Download, RotateCw, X, Search,
} from 'lucide-react';
import { EVENT_TYPE_META } from '../scheduleShared';

/*
 * The player schedule's control surface, in ONE row.
 *
 * This is a COPY of the admin ScheduleToolbar's geometry (components/schedule/
 * admin/ScheduleToolbar.tsx), deliberately duplicated rather than shared so the
 * admin file stays untouched and the player build can never grow an admin
 * affordance by accident.
 *
 * It replaces three stacked rows on the player screen — a 36px "Programul meu"
 * page title, a month-range line, and a standalone view switcher — which cost
 * ~230px of chrome before a single day of the calendar was visible. The month
 * label and its arrows also move here from the calendar card's own header,
 * which was printing the month a second time.
 *
 * What is intentionally ABSENT versus admin: no "Adaugă eveniment", no advanced
 * filter modal (coach/team/show-cancelled), no FRB sync. Players get the two
 * read-only actions they already had: export and refresh.
 */

export type PlayerScheduleView = 'month' | 'week' | 'agenda';
export type PlayerEventFilter = 'all' | 'training' | 'match' | 'camp';

const VIEW_OPTIONS: { key: PlayerScheduleView; icon: typeof LayoutGrid; label: string }[] = [
  { key: 'month', icon: LayoutGrid, label: 'Lună' },
  { key: 'week', icon: CalendarDays, label: 'Săptămână' },
  { key: 'agenda', icon: List, label: 'Agendă' },
];

// Mirrors the player screen's existing filter set (a subset of the admin
// types) — the filtering behaviour is unchanged, only the chip geometry is.
const FILTER_ORDER: { key: Exclude<PlayerEventFilter, 'all'>; label: string }[] = [
  { key: 'training', label: 'Antrenamente' },
  { key: 'match', label: 'Meciuri' },
  { key: 'camp', label: 'Cantonamente' },
];

/** Compact icon button — admin IconButton geometry (36x36, radius 10). */
function IconButton({
  onPress, label, disabled, children,
}: {
  onPress: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      className={`relative w-9 h-9 rounded-[10px] items-center justify-center border bg-[var(--c-surface)] border-[var(--c-border)] ${
        disabled ? 'opacity-50' : ''
      }`}
    >
      {children}
    </TouchableOpacity>
  );
}

export function PlayerScheduleToolbar({
  monthLabel,
  year,
  eventCount,
  onNavigateMonth,
  onToday,
  view,
  onViewChange,
  filter,
  onFilterChange,
  typeCounts,
  onExport,
  onRefresh,
  refreshing,
  isMobile,
  searchValue,
  onClearSearch,
}: {
  monthLabel: string;
  year: number;
  eventCount: number;
  onNavigateMonth: (delta: number) => void;
  onToday: () => void;
  view: PlayerScheduleView;
  onViewChange: (view: PlayerScheduleView) => void;
  filter: PlayerEventFilter;
  onFilterChange: (value: PlayerEventFilter) => void;
  typeCounts: Record<string, number>;
  onExport: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  isMobile: boolean;
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
        onPress={() => onFilterChange('all')}
        className={`h-8 px-3 rounded-[9px] justify-center border ${
          filter === 'all' ? 'border-transparent' : 'border-[var(--c-border)] bg-[var(--c-surface)]'
        }`}
        style={filter === 'all' ? { backgroundColor: 'var(--c-brand-surface)' } : undefined}
      >
        <Text
          className="text-[12px] font-semibold"
          style={{ color: filter === 'all' ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}
        >
          Toate
        </Text>
      </TouchableOpacity>

      {FILTER_ORDER.map(({ key, label }) => {
        const meta = EVENT_TYPE_META[key];
        const active = filter === key;
        const count = typeCounts[key] ?? 0;
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onFilterChange(active ? 'all' : key)}
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
              {label}
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
      <IconButton onPress={onExport} label="Exportă luna (.ics)">
        <Download size={15} color="var(--c-muted)" />
      </IconButton>
      <IconButton onPress={onRefresh} label="Reîmprospătează" disabled={refreshing}>
        {refreshing
          ? <ActivityIndicator size="small" color="var(--c-brand-fg)" />
          : <RotateCw size={15} color="var(--c-muted)" />}
      </IconButton>
    </View>
  );

  // Applied-search pill. Only rendered when a search is actually scoping the
  // view, so the row costs nothing in the common case.
  const activePills = searchValue ? (
    <View className="flex-row items-center flex-wrap gap-1.5 mt-2">
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
    </View>
  ) : null;

  if (isMobile) {
    return (
      <View>
        <View className="flex-row items-center justify-between gap-2">
          {monthNav}
          <View className="flex-row items-center gap-1.5">
            {viewSwitcher}
            {actions}
          </View>
        </View>

        {/* Horizontal scroll rather than wrap: the chips wrapped onto multiple
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

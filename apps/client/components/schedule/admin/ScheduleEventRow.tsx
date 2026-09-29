import React from 'react';
import { View, Text, TouchableOpacity } from '@/src/web/reactNative';
import { Copy, Ban, RotateCcw, ClipboardCheck, Star } from 'lucide-react';
import { CalendarEvent } from '../../../services/eventsApi';
import { EVENT_TYPE_META, isCancelledEvent, formatTimeRange } from '../scheduleShared';
import DateTile from '../../ui/DateTile';

/**
 * One event as a row inside a grouped surface card (Evenimente viitoare,
 * Agendă). Replaces the old stand-alone card: white slab, 20px radius, a 3px
 * coloured left stripe bending round the corner and 9px black uppercase
 * badges — it never matched the tokenised cards elsewhere in the app.
 *
 * The type colour now lives in the date tile and a small dot; actions only
 * appear on desktop, on phones the whole row opens the event.
 */
export const ScheduleEventRow = React.memo(({
  item,
  showActions = false,
  onPress,
  onAttendance,
  onGrade,
  onDuplicate,
  onToggleCancelled,
}: {
  item: CalendarEvent;
  showActions?: boolean;
  onPress: () => void;
  onAttendance?: () => void;
  onGrade?: () => void;
  onDuplicate?: () => void;
  onToggleCancelled?: () => void;
}) => {
  const meta = EVENT_TYPE_META[item.type] ?? EVENT_TYPE_META.admin;
  const cancelled = isCancelledEvent(item);
  const canTrack = item.type === 'training' || item.type === 'match';

  return (
    // Plain View: the navigable region and the action buttons are sibling
    // pressables (a <button> inside a <button> is invalid HTML).
    <View className={`flex-row items-center gap-3 px-3.5 py-3 ${cancelled ? 'opacity-60' : ''}`}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        className="flex-1 min-w-0 flex-row items-center gap-3"
      >
        <DateTile value={item.startTime} fg={meta.onSoft} bg={meta.soft} size={44} />
        <View className="flex-1 min-w-0">
          <Text
            numberOfLines={1}
            className={`text-[14.5px] font-semibold ${cancelled ? 'line-through' : ''}`}
            style={{ color: 'var(--c-ink)' }}
          >
            {item.title}
          </Text>
          <View className="flex-row items-center gap-1.5 mt-0.5 min-w-0">
            <View style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: meta.solid }} />
            <Text className="t-meta shrink-0" style={{ color: 'var(--c-muted)' }}>{meta.label}</Text>
            <Text className="t-meta shrink-0" style={{ color: 'var(--c-faint)' }}>·</Text>
            <Text className="t-meta t-num shrink-0" style={{ color: 'var(--c-muted)' }}>
              {formatTimeRange(item.startTime, item.endTime)}
            </Text>
            {item.location ? (
              <>
                <Text className="t-meta shrink-0" style={{ color: 'var(--c-faint)' }}>·</Text>
                <Text className="t-meta flex-1 min-w-0" numberOfLines={1} style={{ color: 'var(--c-faint)' }}>{item.location}</Text>
              </>
            ) : null}
          </View>
        </View>
        {cancelled ? (
          <View className="px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--c-danger-bg)' }}>
            <Text className="text-[10.5px] font-bold" style={{ color: 'var(--c-danger-fg)' }}>Anulat</Text>
          </View>
        ) : null}
      </TouchableOpacity>

      {showActions ? (
        <View className="flex-row items-center gap-1 shrink-0">
          {canTrack && onAttendance ? (
            <RowAction label="Prezență" onPress={onAttendance}><ClipboardCheck size={15} color="var(--c-brand-fg)" /></RowAction>
          ) : null}
          {canTrack && onGrade ? (
            <RowAction label="Notează" onPress={onGrade}><Star size={15} color="var(--c-muted)" /></RowAction>
          ) : null}
          {onDuplicate ? (
            <RowAction label="Duplică" onPress={onDuplicate}><Copy size={15} color="var(--c-muted)" /></RowAction>
          ) : null}
          {onToggleCancelled ? (
            <RowAction label={cancelled ? 'Reactivează' : 'Anulează'} onPress={onToggleCancelled}>
              {cancelled ? <RotateCcw size={15} color="var(--c-success-fg)" /> : <Ban size={15} color="var(--c-muted)" />}
            </RowAction>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
ScheduleEventRow.displayName = 'ScheduleEventRow';

function RowAction({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      // title → native tooltip on desktop, the icons are unlabeled.
      {...({ title: label } as any)}
      className="ui-press w-8 h-8 rounded-[9px] items-center justify-center hover:bg-[var(--c-surface-2)]"
    >
      {children}
    </TouchableOpacity>
  );
}

/** Grouped surface card that holds event rows with hairline separators. */
export function EventGroupCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View
      className={`ui-rise rounded-[16px] border overflow-hidden ${className ?? ''}`}
      style={{ backgroundColor: 'var(--c-surface)', borderColor: 'var(--c-border)', boxShadow: 'var(--e-sm)' } as any}
    >
      {rows.map((row, index) => (
        <View key={(row as React.ReactElement).key ?? index} className={index > 0 ? 'border-t' : ''} style={{ borderColor: 'var(--c-border-soft)' } as any}>
          {row}
        </View>
      ))}
    </View>
  );
}

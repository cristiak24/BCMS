import type { ReactNode } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { CalendarEvent } from '../../services/eventsApi';
import { formatCoachTime, formatCoachTimeRange } from './coachUtils';
import { attendanceRateColor, eventTypeMeta, formatCoachDay, getInitials } from './coachDisplay';

/**
 * The building blocks the three coach screens share.
 *
 * They previously each rolled their own card markup — three different radii
 * (22 / 30 / 34px), three different metric tiles and three different player
 * rows — so the coach area read as three products. These are the player-side
 * shapes (16px cards, 14px rows, token colours) expressed once.
 */

export function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full px-2.5 py-1 border" style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}>
      <Text className="text-[11px] font-semibold" style={{ color: 'var(--c-muted)' }}>{label}</Text>
    </View>
  );
}

/**
 * Compact number tile. Labels and hints have to survive a ~100px column at
 * 375px, so keep both to roughly one short word each.
 */
export function StatTile({
  label,
  value,
  hint,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color?: string;
  icon?: string;
}) {
  return (
    <View
      className="rounded-[14px] border px-3 sm:px-4 py-3 flex-1 min-w-0"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
    >
      <View className="flex-row items-center gap-1.5 min-w-0">
        {icon ? <MaterialIcons name={icon} size={13} color="var(--c-faint)" /> : null}
        <Text
          className="text-[9.5px] sm:text-[10px] font-bold uppercase tracking-[0.06em] sm:tracking-[0.09em] flex-1 min-w-0"
          style={{ color: 'var(--c-muted)' }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Text className="text-[19px] sm:text-[22px] font-bold mt-1" style={{ color: color ?? 'var(--c-ink)' }} numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text className="text-[11px] sm:text-[11.5px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One session. A date tile leads instead of a repeated type icon — on a list of
 * sessions the day is what the eye is actually scanning for.
 *
 * Renders as a Pressable only when `onPress` is given, so the same row can be
 * a read-only digest entry on the panel and a selectable target on Prezență.
 */
export function SessionRow({
  event,
  active = false,
  onPress,
  trailing,
  subtitle,
}: {
  event: CalendarEvent;
  active?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
  subtitle?: string;
}) {
  const meta = eventTypeMeta(event.type);
  const detail = subtitle ?? [meta.label, event.teamName || null].filter(Boolean).join(' · ');

  const body = (
    <View className="flex-row items-center gap-3">
      <View
        className="w-[46px] items-center justify-center rounded-[11px] py-1.5 shrink-0"
        style={{ backgroundColor: 'var(--c-surface-tint)' }}
      >
        <Text className="text-[11px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>{formatCoachDay(event.startTime)}</Text>
        <Text className="text-[10px] font-semibold" style={{ color: 'var(--c-brand-fg)' }}>{formatCoachTime(event.startTime)}</Text>
      </View>

      <View className="flex-1 min-w-0">
        <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>{event.title}</Text>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          <MaterialIcons name={meta.icon} size={13} color="var(--c-faint)" />
          <Text className="text-[12px] font-medium flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </View>

      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </View>
  );

  const style = {
    borderColor: active ? 'var(--c-brand-fg)' : 'var(--c-border)',
    backgroundColor: active ? 'var(--c-surface-tint)' : 'var(--c-surface)',
    boxShadow: 'var(--e-sm)',
  } as any;

  if (!onPress) {
    return <View className="rounded-[14px] border px-3.5 py-3" style={style}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${event.title}, ${formatCoachDay(event.startTime)} ${formatCoachTimeRange(event.startTime, event.endTime)}`}
      className="rounded-[14px] border px-3.5 py-3 text-left w-full"
      style={style}
    >
      {body}
    </Pressable>
  );
}

/**
 * Roster line: badge, name, one line of context, and a trailing slot.
 *
 * `bare` drops the chrome for rows that already sit inside a card of their own —
 * a bordered row inside a bordered row reads as a rendering bug.
 */
export function CoachPlayerRow({
  firstName,
  lastName,
  badge,
  meta,
  trailing,
  bare = false,
}: {
  firstName?: string | null;
  lastName?: string | null;
  badge?: string;
  meta?: string | null;
  trailing?: ReactNode;
  bare?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 min-w-0 ${bare ? '' : 'rounded-[12px] border px-3.5 py-3'}`}
      style={bare ? undefined : ({ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any)}
    >
      <View className="h-10 w-10 rounded-full items-center justify-center shrink-0" style={{ backgroundColor: 'var(--c-surface-tint)' }}>
        <Text className="text-[12.5px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>
          {badge ?? getInitials(firstName, lastName)}
        </Text>
      </View>

      <View className="flex-1 min-w-0">
        <Text className="text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
          {firstName} {lastName}
        </Text>
        {meta ? (
          <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{meta}</Text>
        ) : null}
      </View>

      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </View>
  );
}

/** Attendance percentage in the shared traffic-light scale. */
export function AttendanceRate({ rate }: { rate: number | null | undefined }) {
  return (
    <Text className="text-[14px] font-bold" style={{ color: attendanceRateColor(rate) }}>
      {rate == null ? '—' : `${rate}%`}
    </Text>
  );
}

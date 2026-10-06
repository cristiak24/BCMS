import type { ReactNode } from 'react';
import { Pressable, Text, View } from '@/src/web/reactNative';
import { MaterialIcons } from '@/src/web/expoVectorIcons';
import type { CalendarEvent } from '../../services/eventsApi';
import { STAT_TONES, type StatTone } from '../ui/StatCard';
import DateTile from '../ui/DateTile';
import { formatCoachTime, formatCoachTimeRange } from './coachUtils';
import {
  attendanceRateBar,
  attendanceRateBg,
  attendanceRateColor,
  eventTypeMeta,
  formatCoachDay,
  formatRelativeDay,
  getInitials,
} from './coachDisplay';

/**
 * The building blocks the three coach screens share.
 *
 * They previously each rolled their own card markup — three different radii
 * (22 / 30 / 34px), three different metric tiles and three different player
 * rows — so the coach area read as three products. These are the player-side
 * shapes (16px cards, 14px rows, token colours) expressed once.
 *
 * Type floor: nothing here renders below 11px. The first pass ran micro
 * labels at 9.5px, which was unreadable on a phone held at arm's length
 * courtside.
 */

export function Chip({ label, icon }: { label: string; icon?: string }) {
  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2.5 py-1 border"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
    >
      {icon ? <MaterialIcons name={icon} size={12} color="var(--c-muted)" /> : null}
      <Text className="text-[11.5px] font-semibold" style={{ color: 'var(--c-ink-soft)' }}>{label}</Text>
    </View>
  );
}

/**
 * Compact number tile for inside a card. Labels and hints have to survive a
 * ~100px column at 375px, so keep both to roughly one short word each.
 */
export function StatTile({
  label,
  value,
  hint,
  color,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color?: string;
  icon?: string;
  tone?: StatTone;
}) {
  const toneColors = tone ? STAT_TONES[tone] : null;

  return (
    <View
      className="rounded-[12px] border px-3 py-2.5 flex-1 min-w-0"
      style={{ borderColor: 'var(--c-border)', backgroundColor: 'var(--c-surface-2)' } as any}
    >
      <View className="flex-row items-center gap-1.5 min-w-0">
        {/* Icon drops below sm: three tiles across 375px leave ~95px each, and
            the icon was what pushed "PREZENȚI" into an ellipsis. */}
        {icon ? (
          <View className="hidden sm:flex">
            <MaterialIcons name={icon} size={14} color={toneColors?.fg ?? 'var(--c-muted)'} />
          </View>
        ) : null}
        <Text className="t-eyebrow flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        className="f-display t-num text-[19px] sm:text-[20px] font-extrabold mt-1 leading-tight"
        style={{ color: color ?? toneColors?.fg ?? 'var(--c-ink-strong)' }}
        numberOfLines={1}
      >
        {value}
      </Text>
      {hint ? (
        <Text className="text-[12px] font-medium mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One session. A date tile leads instead of a repeated type icon — on a list of
 * sessions the day is what the eye is actually scanning for. The tile carries
 * the type's accent (match = amber, camp = sky…), and sessions within the next
 * week get an "Azi / Mâine / În 3 zile" pill.
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
  compact = false,
}: {
  event: CalendarEvent;
  active?: boolean;
  onPress?: () => void;
  trailing?: ReactNode;
  subtitle?: string;
  /** Tighter row for the narrow picker rail. */
  compact?: boolean;
}) {
  const meta = eventTypeMeta(event.type);
  const relative = formatRelativeDay(event.startTime);
  const detail = subtitle ?? [meta.label, event.teamName || null].filter(Boolean).join(' · ');

  const body = (
    <View className="flex-row items-center gap-3">
      <DateTile value={event.startTime} fg={meta.fg} bg={meta.bg} size={compact ? 44 : 48} />

      <View className="flex-1 min-w-0">
        <View className="flex-row items-center gap-2 min-w-0">
          <Text className="f-display text-[14.5px] font-bold flex-1 min-w-0" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
            {event.title}
          </Text>
          {relative && !compact ? (
            <View className="rounded-full px-2 py-0.5 shrink-0" style={{ backgroundColor: relative === 'Azi' ? 'var(--c-brand-surface)' : 'var(--c-surface-3)' }}>
              <Text className="text-[11px] font-bold" style={{ color: relative === 'Azi' ? 'var(--c-on-brand)' : 'var(--c-ink-soft)' }}>
                {relative}
              </Text>
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1.5 mt-1 min-w-0">
          <MaterialIcons name="schedule" size={13} color="var(--c-faint)" />
          <Text className="t-meta shrink-0" style={{ color: relative === 'Azi' ? 'var(--c-brand-fg)' : 'var(--c-ink-soft)' }}>
            {/* The narrow picker rail has no room for the relative pill, so
                "Mâine 18:00" folds into the time instead. */}
            {compact
              ? [relative, formatCoachTime(event.startTime)].filter(Boolean).join(' ')
              : formatCoachTimeRange(event.startTime, event.endTime)}
          </Text>
          <Text className="t-meta" style={{ color: 'var(--c-faint)' }}>·</Text>
          <MaterialIcons name={meta.icon} size={13} color={meta.fg} />
          <Text className="t-meta flex-1 min-w-0" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>
            {detail}
          </Text>
        </View>
      </View>

      {trailing ? <View className="shrink-0">{trailing}</View> : null}
      {onPress && !trailing && !compact ? (
        <MaterialIcons name={active ? 'radio-button-checked' : 'chevron-right'} size={18} color={active ? 'var(--c-brand-fg)' : 'var(--c-faint)'} />
      ) : null}
    </View>
  );

  const style = {
    borderColor: active ? 'var(--c-brand-border)' : 'var(--c-border)',
    backgroundColor: active ? 'var(--c-surface-tint)' : 'var(--c-surface)',
    boxShadow: active ? '0 0 0 1px var(--c-brand-border), var(--e-sm)' : 'var(--e-sm)',
  } as any;

  if (!onPress) {
    return <View className="ui-lift rounded-[14px] border px-3 py-2.5" style={style}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${event.title}, ${formatCoachDay(event.startTime)} ${formatCoachTimeRange(event.startTime, event.endTime)}`}
      className={`ui-lift ui-press rounded-[14px] border text-left w-full ${compact ? 'px-3 py-2' : 'px-3 py-2.5'}`}
      style={style}
    >
      {body}
    </Pressable>
  );
}

/** Thin attendance bar in the traffic-light scale. */
export function RateBar({ rate }: { rate: number | null | undefined }) {
  const width = rate == null ? 0 : Math.max(4, Math.min(100, rate));
  return (
    <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--c-surface-3)' }}>
      <View className="ui-bar h-full rounded-full" style={{ width: `${width}%`, backgroundColor: attendanceRateBar(rate) }} />
    </View>
  );
}

/**
 * Roster line: badge, name, one line of context, and a trailing slot.
 *
 * `bare` drops the chrome for rows that already sit inside a card of their own —
 * a bordered row inside a bordered row reads as a rendering bug. `rate` adds a
 * thin attendance bar under the name.
 */
export function CoachPlayerRow({
  firstName,
  lastName,
  badge,
  meta,
  trailing,
  bare = false,
  rate,
}: {
  firstName?: string | null;
  lastName?: string | null;
  badge?: string;
  meta?: string | null;
  trailing?: ReactNode;
  bare?: boolean;
  rate?: number | null;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 min-w-0 ${bare ? '' : 'rounded-[12px] border px-3 py-2'}`}
      style={bare ? undefined : ({ borderColor: 'var(--c-border-soft)', backgroundColor: 'var(--c-surface-2)' } as any)}
    >
      <View
        className="h-9 w-9 rounded-full items-center justify-center shrink-0 border"
        style={{ backgroundColor: 'var(--c-surface-tint)', borderColor: 'color-mix(in srgb, var(--c-brand-fg) 22%, transparent)' } as any}
      >
        <Text className="text-[12.5px] font-bold" style={{ color: 'var(--c-brand-fg)' }}>
          {badge ?? getInitials(firstName, lastName)}
        </Text>
      </View>

      <View className="flex-1 min-w-0">
        <Text className="f-display text-[14px] font-bold" style={{ color: 'var(--c-ink)' }} numberOfLines={1}>
          {firstName} {lastName}
        </Text>
        {meta ? (
          <Text className="t-meta mt-0.5" style={{ color: 'var(--c-muted)' }} numberOfLines={1}>{meta}</Text>
        ) : null}
        {rate !== undefined ? <View className="mt-1.5 max-w-[180px]"><RateBar rate={rate} /></View> : null}
      </View>

      {trailing ? <View className="shrink-0">{trailing}</View> : null}
    </View>
  );
}

/** Attendance percentage as a tinted pill in the shared traffic-light scale. */
export function AttendanceRate({ rate }: { rate: number | null | undefined }) {
  return (
    <View className="rounded-full px-2.5 py-1 min-w-[48px] items-center" style={{ backgroundColor: attendanceRateBg(rate) }}>
      <Text className="t-num text-[13px] font-bold" style={{ color: attendanceRateColor(rate) }}>
        {rate == null ? '—' : `${rate}%`}
      </Text>
    </View>
  );
}

export { DateTile };

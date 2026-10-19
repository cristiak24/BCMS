import { Text, TouchableOpacity } from '@/src/web/reactNative';
import type { CalendarEvent } from '../../services/eventsApi';
import { isContinuationDay } from '../../utils/eventDays';
import { plural } from '../../utils/plural';
import { EVENT_TYPE_META, formatEventTime } from './scheduleShared';

/**
 * One event inside a month-grid day (admin and member calendars). It starts
 * with the time ("18:00 Antrenament U12"); the grid used to show only the
 * title. On the later days of a multi-day event (a camp) it reads
 * "↳ Cantonament Predeal" in the soft tone, so the span is visible.
 */
export function CalendarEventPill({ event, dateKey, onPress }: { event: CalendarEvent; dateKey: string | null; onPress: () => void }) {
  const meta = EVENT_TYPE_META[event.type] ?? EVENT_TYPE_META.admin;
  const continued = dateKey ? isContinuationDay(event, dateKey) : false;
  const solid = event.type === 'match' && !continued;
  const time = formatEventTime(event.startTime);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityLabel={continued ? `${event.title}, continuă` : `${time}, ${event.title}`}
      className="hover:opacity-80"
      style={{
        borderRadius: 7,
        paddingHorizontal: 6,
        paddingVertical: 3,
        backgroundColor: solid ? meta.solid : meta.soft,
        opacity: continued ? 0.85 : 1,
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '800', color: solid ? meta.onSolid : meta.onSoft }}>
        {continued ? (
          `↳ ${event.title}`
        ) : (
          <>
            <Text className="t-num" style={{ fontWeight: '700', opacity: 0.8 }}>{time}</Text>
            {` ${event.title}`}
          </>
        )}
      </Text>
    </TouchableOpacity>
  );
}

/** "21 octombrie: 2 evenimente" — the name of a day button in the grid. */
export function calendarDayLabel(date: Date | null, dayNumber: number, count: number) {
  const day = date ? date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' }) : String(dayNumber);
  return count ? `${day}: ${plural(count, 'eveniment', 'evenimente')}` : `${day}: nimic programat`;
}

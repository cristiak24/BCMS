import { Platform } from '@/src/web/reactNative';
import { CalendarEvent } from '../../services/eventsApi';

/**
 * Shared, pure schedule helpers used by both the admin schedule page and the
 * player/coach (tabs) schedule page. Keeping these in one place avoids the
 * two screens drifting out of sync (e.g. different "is this event over"
 * rules) and keeps each screen file focused on layout/UI.
 */

export type EventType = CalendarEvent['type'];

// ── Event type visual language (admin surfaces) ────────────────────────────
// Single source of truth for colors/labels so the calendar grid, event
// cards, filter chips and legend never disagree with each other.
export const EVENT_TYPE_META: Record<EventType, {
  label: string;
  solid: string;
  border: string;
  soft: string;
  onSoft: string;
  onSolid: string;
}> = {
  match: { label: 'Match', solid: '#1D3E90', border: '#0F3A8A', soft: '#EAF2FF', onSoft: '#1D3E90', onSolid: '#FFFFFF' },
  training: { label: 'Training', solid: '#0EA5E9', border: '#1D9CE8', soft: '#E1F1FF', onSoft: '#0A5EA8', onSolid: '#FFFFFF' },
  camp: { label: 'Camp', solid: '#7C3AED', border: '#7C3AED', soft: '#F1E8FF', onSoft: '#6D28D9', onSolid: '#FFFFFF' },
  admin: { label: 'Admin', solid: '#475569', border: '#64748B', soft: '#F1F5F9', onSoft: '#475569', onSolid: '#FFFFFF' },
};

export function getEventTypeMeta(type: EventType) {
  return EVENT_TYPE_META[type] ?? EVENT_TYPE_META.admin;
}

// ── Date helpers (all local-time, no UTC surprises) ────────────────────────
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeek(date: Date): Date {
  // Monday-first week to match the rest of the schedule UI.
  const day = date.getDay();
  const mondayOffset = (day + 6) % 7;
  return addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -mondayOffset);
}

export function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

// ── Event predicates ────────────────────────────────────────────────────────
export function getEventDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getEventTimestamp(event: CalendarEvent): number {
  return getEventDate(event.startTime)?.getTime() ?? 0;
}

export function isCancelledEvent(event: CalendarEvent): boolean {
  return String(event.status ?? '').toLowerCase() === 'cancelled';
}

export function isUpcomingEvent(event: CalendarEvent, now: number = Date.now()): boolean {
  const endTime = getEventDate(event.endTime || event.startTime)?.getTime() ?? 0;
  return endTime >= now;
}

export function sortByStartTime(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => getEventTimestamp(a) - getEventTimestamp(b));
}

export function eventMatchesSearch(event: CalendarEvent, query: string): boolean {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return true;
  return [event.title, event.location, event.teamName, event.description]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(trimmed));
}

// ── Calendar grid ───────────────────────────────────────────────────────────
export type CalendarDayCell = {
  key: string;
  dayNumber: number | null;
  date: Date | null;
  dateKey: string | null;
  isToday: boolean;
  events: CalendarEvent[];
};

/**
 * Builds a Monday-first month grid. `minSlots` pads the grid to a fixed cell
 * count (e.g. 42 for a stable 6-row layout); omit it to only pad to a
 * multiple of 7.
 */
export function getMonthGridDays(viewDate: Date, eventsByDay: Map<string, CalendarEvent[]>, minSlots = 0): CalendarDayCell[] {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayKey = toDateKey(new Date());
  const firstDay = new Date(year, month, 1);
  const totalDays = daysInMonth(month, year);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const rawSlots = mondayOffset + totalDays;
  const slots = Math.max(minSlots, Math.ceil(rawSlots / 7) * 7);

  return Array.from({ length: slots }, (_, index) => {
    const dayNumber = index - mondayOffset + 1;

    if (dayNumber < 1 || dayNumber > totalDays) {
      return { key: `empty-${index}`, dayNumber: null, date: null, dateKey: null, isToday: false, events: [] };
    }

    const date = new Date(year, month, dayNumber);
    const dateKey = toDateKey(date);

    return {
      key: dateKey,
      dayNumber,
      date,
      dateKey,
      isToday: dateKey === todayKey,
      events: eventsByDay.get(dateKey) ?? [],
    };
  });
}

export function groupEventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const byDay = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const date = getEventDate(event.startTime);
    if (!date) return;
    const key = toDateKey(date);
    byDay.set(key, [...(byDay.get(key) ?? []), event]);
  });
  return byDay;
}

// ── Formatting ──────────────────────────────────────────────────────────────
export function formatMonthYear(date: Date): string {
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

export function formatEventTime(value: string): string {
  const date = getEventDate(value);
  if (!date) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatTimeRange(start: string, end: string): string {
  const startTime = formatEventTime(start);
  const endDate = getEventDate(end);
  if (!endDate) return startTime;
  return `${startTime} - ${formatEventTime(end)}`;
}

// ── File export (web only, mirrors the CSV export used in AttendanceTab) ───
export function triggerFileDownload(filename: string, content: string, mimeType: string): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return false;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

function toICSDate(value: string): string {
  const date = new Date(value);
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeICSText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function buildICSCalendar(events: CalendarEvent[], calendarName = 'BCMS Schedule'): string {
  const lines: (string | null)[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BCMS//Schedule//EN',
    `X-WR-CALNAME:${escapeICSText(calendarName)}`,
  ];

  events.forEach((event) => {
    const location = event.location ?? '';
    const description = event.description ?? '';
    lines.push(
      'BEGIN:VEVENT',
      `UID:event-${event.id}@bcms`,
      `DTSTAMP:${toICSDate(new Date().toISOString())}`,
      `DTSTART:${toICSDate(event.startTime)}`,
      `DTEND:${toICSDate(event.endTime)}`,
      `SUMMARY:${escapeICSText(`${getEventTypeMeta(event.type).label}: ${event.title}`)}`,
      location ? `LOCATION:${escapeICSText(location)}` : null,
      description ? `DESCRIPTION:${escapeICSText(description)}` : null,
      isCancelledEvent(event) ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return lines.filter((line): line is string => line !== null).join('\r\n');
}

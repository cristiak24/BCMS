import { CalendarEvent, EventAttendance, eventsApi } from '../services/eventsApi';
import { ApiError } from '../services/apiClient';
import { AuthUser } from './authSession';

export type PlayerAttendanceSummary = {
  rate: number | null;
  present: number;
  total: number;
};

export type PlayerAttendanceRecord = {
  event: CalendarEvent;
  attendance: EventAttendance | null;
  status: string | null;
};

function normalizeName(value?: string | null) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isPresentAttendanceStatus(status?: string | null) {
  const normalized = String(status ?? '').toLowerCase();
  return normalized === 'present' || normalized === 'prezent';
}

export function isCountedAttendanceStatus(status?: string | null) {
  const normalized = String(status ?? '').toLowerCase();
  return ['present', 'prezent', 'absent', 'medical', 'excused'].includes(normalized);
}

export function findCurrentPlayerAttendance(rows: EventAttendance[], user: AuthUser | null) {
  if (!user) {
    return null;
  }

  const userNames = [
    normalizeName(user.name),
    normalizeName([user.firstName, user.lastName].filter(Boolean).join(' ')),
  ].filter(Boolean);

  const byName = rows.find((row) => {
    const rowName = normalizeName([row.firstName, row.lastName].filter(Boolean).join(' '));
    return userNames.includes(rowName);
  });

  if (byName) {
    return byName;
  }

  const userId = user.id == null ? null : Number(user.id);
  if (userId != null) {
    return rows.find((row) => Number(row.playerId) === userId) ?? null;
  }

  return null;
}

export function summarizePlayerAttendance(records: PlayerAttendanceRecord[]): PlayerAttendanceSummary {
  let present = 0;
  let total = 0;

  records.forEach((record) => {
    if (!isCountedAttendanceStatus(record.status)) {
      return;
    }

    total += 1;
    if (isPresentAttendanceStatus(record.status)) {
      present += 1;
    }
  });

  return {
    rate: total > 0 ? Math.round((present / total) * 100) : null,
    present,
    total,
  };
}

const MY_ATTENDANCE_BATCH = 100;

/**
 * Own rows via the batched endpoint — one request per 100 events instead of one
 * per event. Falls back to the per-event sheets only when the server predates
 * /players/me/attendance (404), so a frontend deployed ahead of the API keeps
 * working.
 */
async function loadOwnAttendanceRecords(user: AuthUser, pastEvents: CalendarEvent[]): Promise<PlayerAttendanceRecord[]> {
  try {
    const ids = pastEvents.map((event) => event.id).filter((id) => id > 0);
    const batches: number[][] = [];
    for (let index = 0; index < ids.length; index += MY_ATTENDANCE_BATCH) {
      batches.push(ids.slice(index, index + MY_ATTENDANCE_BATCH));
    }
    const rows = (await Promise.all(batches.map((batch) => eventsApi.getMyAttendance(batch)))).flat();
    const byEvent = new Map(rows.map((row) => [row.eventId, row]));

    return pastEvents.map((event) => {
      const attendance = byEvent.get(event.id) ?? null;
      return { event, attendance, status: attendance?.status ?? null };
    });
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      throw error;
    }
  }

  const attendanceResults = await Promise.allSettled(
    pastEvents.map((event) => eventsApi.getEventAttendance(event.id))
  );

  return pastEvents.map((event, index) => {
    const result = attendanceResults[index];
    const rows = result?.status === 'fulfilled' ? result.value : [];
    const attendance = findCurrentPlayerAttendance(rows, user);
    return { event, attendance, status: attendance?.status ?? null };
  });
}

export async function loadPlayerAttendanceDetails(
  user: AuthUser | null,
  allEvents: CalendarEvent[],
  limit = 30
) {
  const now = Date.now();
  const recentPastEvents = allEvents
    .filter((event) => {
      const eventDate = new Date(event.startTime).getTime();
      return event.status !== 'cancelled' && !Number.isNaN(eventDate) && eventDate <= now;
    })
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, limit);

  if (!user || recentPastEvents.length === 0) {
    return { summary: { rate: null, present: 0, total: 0 }, records: [] };
  }

  const records = await loadOwnAttendanceRecords(user, recentPastEvents);

  return {
    summary: summarizePlayerAttendance(records),
    records,
  };
}

/**
 * The player's own attendance history, newest first — for the Prezență screen.
 *
 * Uses the server's recent-history mode (own rows joined with their events).
 * Against an older API (404) it falls back to the previous approach: the club
 * calendar + per-event sheets.
 */
export async function loadMyAttendanceHistory(user: AuthUser | null, limit = 40) {
  try {
    const rows = await eventsApi.getMyRecentAttendance(limit);
    const records: PlayerAttendanceRecord[] = rows.map((row) => ({
      event: row.event,
      attendance: { playerId: row.playerId, firstName: '', lastName: '', number: null, status: row.status, note: row.note ?? null },
      status: row.status,
    }));
    return { summary: summarizePlayerAttendance(records), records };
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      throw error;
    }
  }

  const events = await eventsApi.getEvents();
  return loadPlayerAttendanceDetails(user, events, limit);
}

export async function loadPlayerAttendanceSummary(user: AuthUser | null, allEvents: CalendarEvent[]) {
  const details = await loadPlayerAttendanceDetails(user, allEvents, 20);
  return details.summary;
}

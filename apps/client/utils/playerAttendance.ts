import { CalendarEvent, EventAttendance, eventsApi } from '../services/eventsApi';
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

  const attendanceResults = await Promise.allSettled(
    recentPastEvents.map((event) => eventsApi.getEventAttendance(event.id))
  );

  const records = recentPastEvents.map((event, index) => {
    const result = attendanceResults[index];
    const rows = result?.status === 'fulfilled' ? result.value : [];
    const attendance = findCurrentPlayerAttendance(rows, user);

    return {
      event,
      attendance,
      status: attendance?.status ?? null,
    };
  });

  return {
    summary: summarizePlayerAttendance(records),
    records,
  };
}

export async function loadPlayerAttendanceSummary(user: AuthUser | null, allEvents: CalendarEvent[]) {
  const details = await loadPlayerAttendanceDetails(user, allEvents, 20);
  return details.summary;
}

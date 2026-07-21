export interface WeekInfo {
  label: string;
  days: Date[];
}

export type NormalizedAttendanceStatus = 'present' | 'absent' | 'medical' | 'pending';

export function getWeeksInMonth(year: number, month: number): WeekInfo[] {
  const weeks: WeekInfo[] = [];
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  let currentDay = new Date(firstDayOfMonth);
  // Rewind to Monday (0 = Sunday, 1 = Monday ... 6 = Saturday)
  const firstDayOfWeek = currentDay.getDay() === 0 ? 6 : currentDay.getDay() - 1;
  currentDay.setDate(currentDay.getDate() - firstDayOfWeek);

  let weekNumber = 1;
  while (currentDay <= lastDayOfMonth || weeks[weeks.length - 1]?.days[6] < lastDayOfMonth) {
    const weekDays: Date[] = [];
    for (let i = 0; i < 7; i++) {
        weekDays.push(new Date(currentDay));
        currentDay.setDate(currentDay.getDate() + 1);
    }
    weeks.push({
      label: `Week ${weekNumber}`,
      days: weekDays,
    });
    weekNumber++;
    // Break to avoid infinite loop just in case
    if (weekNumber > 6) break;
  }

  return weeks;
}

export function startOfWeekMonday(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const jsDay = normalized.getDay(); // 0=Sun
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  normalized.setDate(normalized.getDate() + diffToMonday);
  return normalized;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getWeekDaysFromDate(date: Date): Date[] {
  const start = startOfWeekMonday(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date
    .getDate()
    .toString()
    .padStart(2, '0')}`;
}

export function getIsoWeekNumber(date: Date): number {
  const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  return Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export type CellStatus = 'present' | 'absent' | 'medical' | 'partial' | 'no-session' | 'pending';

export interface AggregateAttendance {
  status: CellStatus;
  presentCount: number;
  absentCount: number;
  totalEvents: number;
  eventDetails: {
      eventId: number;
      eventTitle: string;
      startTime: string;
      status: Exclude<NormalizedAttendanceStatus, 'pending'> | null;
  }[];
}

export function normalizeAttendanceStatus(status: string | null | undefined): NormalizedAttendanceStatus {
  if (status === 'present') return 'present';
  if (status === 'absent') return 'absent';
  if (status === 'medical' || status === 'excused') return 'medical';
  return 'pending';
}

export function computeDailyAttendance(
  playerId: number,
  eventsOnDay: any[],
  attendanceByEventId: Record<number, any[]>
): AggregateAttendance {
  if (eventsOnDay.length === 0) {
      return { status: 'no-session', presentCount: 0, absentCount: 0, totalEvents: 0, eventDetails: [] };
  }

  let presentCount = 0;
  let absentCount = 0;
  let medicalCount = 0;
  let pendingCount = 0;
  const eventDetails = [];

  for (const event of eventsOnDay) {
      const attendanceList = attendanceByEventId[event.id] || [];
      const playerRecord = attendanceList.find((a: any) => a.playerId === playerId);
      const status = normalizeAttendanceStatus(playerRecord?.status);

      if (status === 'present') presentCount++;
      else if (status === 'absent') absentCount++;
      else if (status === 'medical') medicalCount++;
      else pendingCount++;

      eventDetails.push({
          eventId: event.id,
          eventTitle: event.title,
          startTime: event.startTime,
          status: status !== 'pending' ? status : null,
      });
  }

  const totalEvents = eventsOnDay.length;
  let finalStatus: CellStatus = 'no-session';

  if (presentCount === totalEvents) {
      finalStatus = 'present';
  } else if (absentCount === totalEvents) {
      finalStatus = 'absent';
  } else if (medicalCount === totalEvents) {
      finalStatus = 'medical';
  } else if (presentCount > 0 || absentCount > 0 || medicalCount > 0) {
      finalStatus = 'partial';
  } else {
      finalStatus = 'pending';
  }

  return {
      status: finalStatus,
      presentCount,
      absentCount,
      totalEvents,
      eventDetails,
  };
}

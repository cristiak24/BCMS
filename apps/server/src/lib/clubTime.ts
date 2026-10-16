/**
 * Calendar maths in the clubs' own time zone. The server runs in UTC on
 * Render, so `new Date(y, m, d, 23, 59, 59)` meant 23:59 UTC — 02:59 the next
 * day in Romania — and "due on the 25th" showed as the 26th. Everything that
 * turns a calendar date into an instant (or back) for money goes through here.
 */
export const CLUB_TIME_ZONE = 'Europe/Bucharest';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CLUB_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Wall-clock parts of `date` in Romania (month is 1–12). */
export function clubDateParts(date: Date) {
    const parts = partsFormatter.formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** The Romanian calendar month `date` falls in. */
export function clubMonth(date: Date) {
    const { year, month } = clubDateParts(date);
    return { year, month };
}

function offsetMs(utcMs: number) {
    const p = clubDateParts(new Date(utcMs));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The instant at which Romania's clock reads the given wall time (month 1–12;
 * day/month overflow rolls over like Date.UTC). DST-aware.
 */
export function clubDateTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
    const guess = Date.UTC(year, month - 1, day, hour, minute, second);
    const first = guess - offsetMs(guess);
    // Second pass for the hours around a DST switch.
    return new Date(guess - offsetMs(first));
}

/** Number of days in a calendar month (month 1–12). */
export function daysInMonth(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

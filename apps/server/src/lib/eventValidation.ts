/**
 * Pure validation for event and attendance writes.
 *
 * Kept free of DB/Express imports so it can be unit-tested directly
 * (see eventValidation.test.ts). The controllers call these before touching
 * the database; anything these reject is a 400, never a 500.
 */

export const EVENT_TYPES = ['training', 'match', 'camp', 'admin', 'medical'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Attendance statuses the product writes. `late` is counted by club metrics;
 * `prezent` is the legacy Romanian spelling still present in old rows, so it
 * is normalised to `present` on the way in rather than rejected.
 */
export const ATTENDANCE_STATUSES = ['present', 'absent', 'medical', 'excused', 'late'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

/** Upper bound on one attendance request — a squad, not a club export. */
export const MAX_ATTENDANCE_ITEMS = 200;
export const MAX_NOTE_LENGTH = 2000;
const MAX_STATUS_LENGTH = 50;
const MAX_TITLE_LENGTH = 255;

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export function isEventType(value: unknown): value is EventType {
    return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

export function normalizeAttendanceStatus(value: unknown): AttendanceStatus | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'prezent') return 'present';
    return (ATTENDANCE_STATUSES as readonly string[]).includes(normalized) ? normalized as AttendanceStatus : null;
}

export type AttendanceItem = {
    playerId: number;
    status: AttendanceStatus;
    /** undefined = leave the stored note alone; null = clear it. */
    note: string | null | undefined;
};

/**
 * Validate a `playerAttendances` array. Duplicate player ids collapse to the
 * LAST occurrence, so a client that double-taps can't create two rows for the
 * same player in one request.
 */
export function parseAttendancePayload(body: unknown): Result<AttendanceItem[]> {
    const raw = (body as { playerAttendances?: unknown } | null | undefined)?.playerAttendances;
    if (!Array.isArray(raw)) {
        return { ok: false, error: 'playerAttendances must be an array.' };
    }
    if (raw.length === 0) {
        return { ok: false, error: 'playerAttendances is empty.' };
    }
    if (raw.length > MAX_ATTENDANCE_ITEMS) {
        return { ok: false, error: `Too many attendance entries (max ${MAX_ATTENDANCE_ITEMS}).` };
    }

    const byPlayer = new Map<number, AttendanceItem>();
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') {
            return { ok: false, error: 'Each attendance entry must be an object.' };
        }
        const item = entry as Record<string, unknown>;
        const playerId = Number(item.playerId);
        if (!Number.isInteger(playerId) || playerId <= 0) {
            return { ok: false, error: 'Each attendance entry needs a valid playerId.' };
        }
        const status = normalizeAttendanceStatus(item.status);
        if (!status) {
            return { ok: false, error: `Invalid attendance status for player ${playerId}.` };
        }

        let note: string | null | undefined;
        if (Object.prototype.hasOwnProperty.call(item, 'note')) {
            if (item.note == null) {
                note = null;
            } else if (typeof item.note === 'string') {
                const trimmed = item.note.trim();
                if (trimmed.length > MAX_NOTE_LENGTH) {
                    return { ok: false, error: `Note is too long (max ${MAX_NOTE_LENGTH} characters).` };
                }
                note = trimmed || null;
            } else {
                return { ok: false, error: 'Note must be a string.' };
            }
        }

        byPlayer.set(playerId, { playerId, status, note });
    }

    return { ok: true, data: Array.from(byPlayer.values()) };
}

function parseDate(value: unknown, field: string): Result<string> {
    const date = value == null || value === '' ? null : new Date(String(value));
    if (!date || Number.isNaN(date.getTime())) {
        return { ok: false, error: `${field} is invalid.` };
    }
    return { ok: true, data: date.toISOString() };
}

function parseOptionalId(value: unknown, field: string): Result<number | null> {
    if (value == null || value === '') return { ok: true, data: null };
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: `${field} is invalid.` };
    return { ok: true, data: id };
}

function parseOptionalText(value: unknown, field: string, max: number): Result<string | null> {
    if (value == null) return { ok: true, data: null };
    if (typeof value !== 'string') return { ok: false, error: `${field} must be text.` };
    const trimmed = value.trim();
    if (trimmed.length > max) return { ok: false, error: `${field} is too long (max ${max} characters).` };
    return { ok: true, data: trimmed || null };
}

export type EventUpdate = Partial<{
    type: EventType;
    title: string;
    description: string | null;
    location: string | null;
    startTime: string;
    endTime: string;
    teamId: number | null;
    coachId: number | null;
    amount: number | null;
    status: string;
    coachNote: string | null;
}>;

/**
 * Whitelist + validate an event write. `mode: 'create'` requires title, both
 * dates and a team; `'update'` only validates what was sent. In both modes the
 * end may not precede the start when both are known.
 */
export function parseEventInput(
    body: unknown,
    mode: 'create' | 'update',
    existing?: { startTime: string; endTime: string },
): Result<EventUpdate> {
    const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined;
    const out: EventUpdate = {};

    if (mode === 'create' || has('type')) {
        const type = input.type ?? 'training';
        if (!isEventType(type)) return { ok: false, error: `type must be one of: ${EVENT_TYPES.join(', ')}.` };
        out.type = type;
    }

    if (mode === 'create' || has('title')) {
        const title = typeof input.title === 'string' ? input.title.trim() : '';
        if (!title) return { ok: false, error: 'Event title is required.' };
        if (title.length > MAX_TITLE_LENGTH) return { ok: false, error: `Event title is too long (max ${MAX_TITLE_LENGTH} characters).` };
        out.title = title;
    }

    for (const key of ['startTime', 'endTime'] as const) {
        if (mode === 'create' || has(key)) {
            const parsed = parseDate(input[key], key);
            if (!parsed.ok) return parsed;
            out[key] = parsed.data;
        }
    }

    const start = out.startTime ?? existing?.startTime;
    const end = out.endTime ?? existing?.endTime;
    if (start && end && new Date(end).getTime() < new Date(start).getTime()) {
        return { ok: false, error: 'endTime must be after startTime.' };
    }

    if (mode === 'create' || has('teamId')) {
        const parsed = parseOptionalId(input.teamId, 'teamId');
        if (!parsed.ok) return parsed;
        if (mode === 'create' && parsed.data == null) return { ok: false, error: 'A valid team is required.' };
        out.teamId = parsed.data;
    }

    if (has('coachId')) {
        const parsed = parseOptionalId(input.coachId, 'coachId');
        if (!parsed.ok) return parsed;
        out.coachId = parsed.data;
    }

    if (has('amount')) {
        if (input.amount == null || input.amount === '') {
            out.amount = null;
        } else {
            const amount = Number(input.amount);
            if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: 'amount must be a positive number.' };
            out.amount = Math.round(amount * 100) / 100;
        }
    }

    if (mode === 'create' || has('status')) {
        const status = input.status == null || input.status === '' ? 'scheduled' : input.status;
        if (typeof status !== 'string' || status.trim().length > MAX_STATUS_LENGTH) {
            return { ok: false, error: 'status is invalid.' };
        }
        out.status = status.trim().toLowerCase();
    }

    for (const [key, max] of [['description', 5000], ['location', 255], ['coachNote', MAX_NOTE_LENGTH]] as const) {
        if (has(key)) {
            const parsed = parseOptionalText(input[key], key, max);
            if (!parsed.ok) return parsed;
            out[key] = parsed.data;
        }
    }

    if (mode === 'update' && Object.keys(out).length === 0) {
        return { ok: false, error: 'No updatable fields supplied.' };
    }

    return { ok: true, data: out };
}

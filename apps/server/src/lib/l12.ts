/**
 * Formular L-12 — "Lista oficială a echipei pentru joc" (FRB).
 *
 * The paper form has 12 player rows (table numbers 4–15) and nine fixed staff
 * rows. This module is the single definition of that shape and the pure
 * validation of what a client may store for it; `routes/l12.ts` adds the
 * database and tenancy checks.
 */

export const L12_MAX_PLAYERS = 12;

/** Staff rows, in the order they are printed on the form. */
export const L12_STAFF_ROLES = [
    'headCoach',
    'assistantCoach1',
    'assistantCoach2',
    'technicalDirector',
    'sportsDirector',
    'manager',
    'doctor',
    'trainer',
    'statistician',
] as const;

export type L12StaffRole = (typeof L12_STAFF_ROLES)[number];

export type L12StaffEntry = { name: string; license: string };

/** What the client sends for one player row. Names are NOT accepted from the
 *  client — the route fills them from the players table. */
export type L12PlayerInput = {
    playerId: number;
    shirtNumber: string;
    license: string;
    u22: boolean;
    citizenship: string;
    naturalized: boolean;
};

export type L12Input = {
    competition: string | null;
    gender: 'M' | 'F' | null;
    players: L12PlayerInput[];
    captainPlayerId: number | null;
    staff: Partial<Record<L12StaffRole, L12StaffEntry>>;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function cleanText(value: unknown, max: number): string {
    if (value == null) return '';
    return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function parseL12Input(body: unknown): Result<L12Input> {
    if (!body || typeof body !== 'object') {
        return { ok: false, error: 'Invalid L12 payload.' };
    }
    const raw = body as Record<string, unknown>;

    const rawPlayers = raw.players ?? [];
    if (!Array.isArray(rawPlayers)) {
        return { ok: false, error: 'players must be a list.' };
    }
    if (rawPlayers.length > L12_MAX_PLAYERS) {
        return { ok: false, error: `An L12 lists at most ${L12_MAX_PLAYERS} players.` };
    }

    const players: L12PlayerInput[] = [];
    const seen = new Set<number>();
    const shirtNumbers = new Set<string>();
    for (const entry of rawPlayers) {
        const row = (entry ?? {}) as Record<string, unknown>;
        const playerId = Number(row.playerId);
        if (!Number.isInteger(playerId) || playerId <= 0) {
            return { ok: false, error: 'Every player needs a valid id.' };
        }
        if (seen.has(playerId)) {
            return { ok: false, error: 'A player can appear only once.' };
        }
        seen.add(playerId);

        const shirtNumber = cleanText(row.shirtNumber, 3);
        if (shirtNumber && !/^\d{1,2}$/.test(shirtNumber)) {
            return { ok: false, error: `Invalid shirt number "${shirtNumber}".` };
        }
        if (shirtNumber) {
            if (shirtNumbers.has(shirtNumber)) {
                return { ok: false, error: `Shirt number ${shirtNumber} is used twice.` };
            }
            shirtNumbers.add(shirtNumber);
        }

        players.push({
            playerId,
            shirtNumber,
            license: cleanText(row.license, 40),
            u22: row.u22 === true,
            citizenship: cleanText(row.citizenship, 40),
            naturalized: row.naturalized === true,
        });
    }

    let captainPlayerId: number | null = null;
    if (raw.captainPlayerId != null && raw.captainPlayerId !== '') {
        const id = Number(raw.captainPlayerId);
        if (!seen.has(id)) {
            return { ok: false, error: 'The captain must be one of the listed players.' };
        }
        captainPlayerId = id;
    }

    const staff: Partial<Record<L12StaffRole, L12StaffEntry>> = {};
    const rawStaff = raw.staff;
    if (rawStaff != null) {
        if (typeof rawStaff !== 'object' || Array.isArray(rawStaff)) {
            return { ok: false, error: 'staff must be an object.' };
        }
        for (const role of L12_STAFF_ROLES) {
            const value = (rawStaff as Record<string, unknown>)[role] as Record<string, unknown> | undefined;
            const name = cleanText(value?.name, 120);
            const license = cleanText(value?.license, 40);
            if (name || license) staff[role] = { name, license };
        }
    }

    const gender = raw.gender === 'M' || raw.gender === 'F' ? raw.gender : null;
    const competition = cleanText(raw.competition, 255) || null;

    return { ok: true, data: { competition, gender, players, captainPlayerId, staff } };
}

/**
 * Field whitelist for `PATCH /api/players/:id`.
 *
 * Kept as a pure function (no db, no req/res) so the rules that decide what a
 * client may write to a player row can be unit-tested directly. The controller
 * previously spread `req.body` into the update, which let any caller rewrite any
 * column — notably `teamId`, moving a player into a team outside the caller's
 * club and side-stepping the access check.
 */

export type PlayerUpdateInput = Record<string, unknown>;

export type PlayerUpdateFields = {
    firstName?: string;
    lastName?: string;
    name?: string;
    /** `null` (or an empty string) clears the address. */
    email?: string | null;
    status?: string;
    avatarUrl?: string;
    number?: number | null;
    birthYear?: number | null;
    medicalCheckExpiry?: string | null;
};

export type PlayerUpdateResult =
    | { ok: true; data: PlayerUpdateFields }
    | { ok: false; error: string };

/** Columns a client is allowed to set. `teamId` and `id` are deliberately absent. */
const TEXT_FIELDS = ['firstName', 'lastName', 'name', 'email', 'status', 'avatarUrl'] as const;

const VALID_STATUSES = new Set(['active', 'inactive', 'injured', 'suspended']);

const MAX_TEXT_LENGTH = 120;

/** The field as the edit form names it — these messages are shown as-is (WP7-E5). */
const FIELD_LABELS: Record<(typeof TEXT_FIELDS)[number], string> = {
    firstName: 'Prenumele', lastName: 'Numele', name: 'Numele complet', email: 'Emailul', status: 'Starea', avatarUrl: 'Poza',
};

export function buildPlayerUpdate(body: PlayerUpdateInput | null | undefined): PlayerUpdateResult {
    const input = body ?? {};
    const data: PlayerUpdateFields = {};

    for (const field of TEXT_FIELDS) {
        const value = input[field];
        if (value === undefined) continue;

        // Most children have no email of their own; the profile form sends
        // `null` for an empty field, which used to fail the whole save.
        if (field === 'email' && value === null) {
            data.email = null;
            continue;
        }

        if (typeof value !== 'string') {
            return { ok: false, error: `${FIELD_LABELS[field]} nu e valid.` };
        }

        const trimmed = value.trim();
        if (trimmed.length > MAX_TEXT_LENGTH) {
            return { ok: false, error: `${FIELD_LABELS[field]} poate avea cel mult ${MAX_TEXT_LENGTH} de caractere.` };
        }

        if (field === 'email') {
            data.email = trimmed || null;
        } else {
            data[field] = trimmed;
        }
    }

    if (data.status !== undefined && !VALID_STATUSES.has(data.status)) {
        return { ok: false, error: 'Starea aleasă nu există.' };
    }

    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return { ok: false, error: 'Adresa de email nu e validă.' };
    }

    if (input.number !== undefined) {
        if (input.number === null) {
            data.number = null;
        } else {
            const parsed = Number(input.number);
            if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
                return { ok: false, error: 'Numărul de tricou trebuie să fie un număr întreg între 0 și 999.' };
            }
            data.number = parsed;
        }
    }

    if (input.birthYear !== undefined) {
        if (input.birthYear === null) {
            data.birthYear = null;
        } else {
            const parsed = Number(input.birthYear);
            const currentYear = new Date().getFullYear();
            if (!Number.isInteger(parsed) || parsed < 1900 || parsed > currentYear) {
                return { ok: false, error: `Anul nașterii trebuie să fie între 1900 și ${currentYear}.` };
            }
            data.birthYear = parsed;
        }
    }

    if (input.medicalCheckExpiry !== undefined) {
        if (input.medicalCheckExpiry === null || input.medicalCheckExpiry === '') {
            data.medicalCheckExpiry = null;
        } else {
            const parsed = new Date(String(input.medicalCheckExpiry));
            if (Number.isNaN(parsed.getTime())) {
                return { ok: false, error: 'Data vizei medicale nu e validă.' };
            }
            data.medicalCheckExpiry = parsed.toISOString();
        }
    }

    if (Object.keys(data).length === 0) {
        return { ok: false, error: 'Nu ai modificat nimic.' };
    }

    return { ok: true, data };
}

"use strict";
/**
 * Field whitelist for `PATCH /api/players/:id`.
 *
 * Kept as a pure function (no db, no req/res) so the rules that decide what a
 * client may write to a player row can be unit-tested directly. The controller
 * previously spread `req.body` into the update, which let any caller rewrite any
 * column — notably `teamId`, moving a player into a team outside the caller's
 * club and side-stepping the access check.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPlayerUpdate = buildPlayerUpdate;
/** Columns a client is allowed to set. `teamId` and `id` are deliberately absent. */
const TEXT_FIELDS = ['firstName', 'lastName', 'name', 'email', 'status', 'avatarUrl'];
const VALID_STATUSES = new Set(['active', 'inactive', 'injured', 'suspended']);
const MAX_TEXT_LENGTH = 120;
function buildPlayerUpdate(body) {
    const input = body ?? {};
    const data = {};
    for (const field of TEXT_FIELDS) {
        const value = input[field];
        if (value === undefined)
            continue;
        if (typeof value !== 'string') {
            return { ok: false, error: `${field} must be a string.` };
        }
        const trimmed = value.trim();
        if (trimmed.length > MAX_TEXT_LENGTH) {
            return { ok: false, error: `${field} must be at most ${MAX_TEXT_LENGTH} characters.` };
        }
        data[field] = trimmed;
    }
    if (data.status !== undefined && !VALID_STATUSES.has(data.status)) {
        return { ok: false, error: 'status is not a valid player status.' };
    }
    if (data.email !== undefined && data.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return { ok: false, error: 'email is not a valid address.' };
    }
    if (input.number !== undefined) {
        if (input.number === null) {
            data.number = null;
        }
        else {
            const parsed = Number(input.number);
            if (!Number.isInteger(parsed) || parsed < 0 || parsed > 999) {
                return { ok: false, error: 'number must be an integer between 0 and 999.' };
            }
            data.number = parsed;
        }
    }
    if (input.birthYear !== undefined) {
        if (input.birthYear === null) {
            data.birthYear = null;
        }
        else {
            const parsed = Number(input.birthYear);
            const currentYear = new Date().getFullYear();
            if (!Number.isInteger(parsed) || parsed < 1900 || parsed > currentYear) {
                return { ok: false, error: 'birthYear is out of range.' };
            }
            data.birthYear = parsed;
        }
    }
    if (input.medicalCheckExpiry !== undefined) {
        if (input.medicalCheckExpiry === null || input.medicalCheckExpiry === '') {
            data.medicalCheckExpiry = null;
        }
        else {
            const parsed = new Date(String(input.medicalCheckExpiry));
            if (Number.isNaN(parsed.getTime())) {
                return { ok: false, error: 'medicalCheckExpiry is not a valid date.' };
            }
            data.medicalCheckExpiry = parsed.toISOString();
        }
    }
    if (Object.keys(data).length === 0) {
        return { ok: false, error: 'No updatable fields were provided.' };
    }
    return { ok: true, data };
}

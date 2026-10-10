import crypto from 'crypto';
import { normalizePhone } from './contacts';

/**
 * Joining a team with its code (teams.invite_code): a parent registers their
 * children, or a teenage player registers themselves. Pure rules, tested.
 */

// Same no-look-alikes alphabet as the club codes (no 0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TEAM_CODE_LENGTH = 6;
export const MAX_CHILDREN_PER_SIGNUP = 5;

export function generateTeamCode() {
    const bytes = crypto.randomBytes(TEAM_CODE_LENGTH);
    let out = '';
    for (let i = 0; i < TEAM_CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return out;
}

export function normalizeTeamCode(raw: string) {
    return String(raw ?? '').toUpperCase().replace(/[\s-]/g, '');
}

/** 6 characters — club codes are 8, invite-link tokens 64. */
export function looksLikeTeamCode(raw: string) {
    return /^[A-Z0-9]{6}$/.test(normalizeTeamCode(raw));
}

/**
 * Older team codes are hex (they can contain 0 and 1); people type O and I/L.
 * The candidates to look up, most literal first.
 */
export function teamCodeCandidates(raw: string) {
    const code = normalizeTeamCode(raw);
    const lenient = code.replace(/O/g, '0').replace(/[IL]/g, '1');
    return lenient === code ? [code] : [code, lenient];
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Accepts YYYY-MM-DD or DD.MM.YYYY; returns YYYY-MM-DD. Ages 3–30. */
export function parseBirthDate(value: unknown, now = new Date()): Result<string> {
    const text = String(value ?? '').trim();
    let y: number; let m: number; let d: number;
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
        [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else if ((match = text.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/))) {
        [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else {
        return { ok: false, error: 'Data nașterii lipsește sau nu e validă.' };
    }
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
        return { ok: false, error: 'Data nașterii nu e validă.' };
    }
    const age = now.getUTCFullYear() - y;
    if (age < 3 || age > 30) return { ok: false, error: 'Data nașterii nu pare corectă.' };
    return { ok: true, value: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
}

function cleanName(value: unknown) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export type ChildInput = { firstName: string; lastName: string; birthDate: string };

export type TeamSignupInput =
    | { kind: 'parent'; phone: string; children: ChildInput[] }
    | { kind: 'player'; phone: string; birthDate: string };

/** The extra fields a team-code signup carries on top of name/email/password. */
export function parseTeamSignup(body: unknown): Result<TeamSignupInput> {
    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const phone = normalizePhone(raw.phone, 'Telefon');
    if (!phone.ok) return phone;
    if (!phone.value) return { ok: false, error: 'Numărul de telefon este obligatoriu.' };

    if (raw.joinAs === 'player') {
        const birthDate = parseBirthDate(raw.birthDate);
        if (!birthDate.ok) return birthDate;
        return { ok: true, value: { kind: 'player', phone: phone.value, birthDate: birthDate.value } };
    }
    if (raw.joinAs !== 'parent') return { ok: false, error: 'Alege dacă ești părinte sau jucător.' };

    const list = Array.isArray(raw.children) ? raw.children : [];
    if (list.length === 0) return { ok: false, error: 'Adaugă cel puțin un copil.' };
    if (list.length > MAX_CHILDREN_PER_SIGNUP) return { ok: false, error: `Poți adăuga cel mult ${MAX_CHILDREN_PER_SIGNUP} copii.` };

    const children: ChildInput[] = [];
    for (const entry of list) {
        const child = (entry ?? {}) as Record<string, unknown>;
        const firstName = cleanName(child.firstName);
        const lastName = cleanName(child.lastName);
        if (!firstName || !lastName) return { ok: false, error: 'Completează numele și prenumele fiecărui copil.' };
        const birthDate = parseBirthDate(child.birthDate);
        if (!birthDate.ok) return { ok: false, error: `${firstName}: ${birthDate.error}` };
        children.push({ firstName, lastName, birthDate: birthDate.value });
    }
    return { ok: true, value: { kind: 'parent', phone: phone.value, children } };
}

/**
 * Children typed on the signup form of a parent code/link: name and birth
 * YEAR only. null = the client sent no children (older build) — the account
 * is still created, just without a child. The year is stored as 1 January.
 */
export function parseParentChildren(body: unknown, now = new Date()): Result<ChildInput[] | null> {
    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (raw.children == null) return { ok: true, value: null };

    const list = Array.isArray(raw.children) ? raw.children : [];
    if (list.length === 0) return { ok: false, error: 'Adaugă cel puțin un copil.' };
    if (list.length > MAX_CHILDREN_PER_SIGNUP) return { ok: false, error: `Poți adăuga cel mult ${MAX_CHILDREN_PER_SIGNUP} copii.` };

    const children: ChildInput[] = [];
    for (const entry of list) {
        const child = (entry ?? {}) as Record<string, unknown>;
        const firstName = cleanName(child.firstName);
        const lastName = cleanName(child.lastName);
        if (!firstName || !lastName) return { ok: false, error: 'Completează numele și prenumele fiecărui copil.' };
        const text = String(child.birthYear ?? '').trim();
        const year = /^\d{4}$/.test(text) ? Number(text) : NaN;
        const age = now.getUTCFullYear() - year;
        if (!Number.isInteger(year) || age < 3 || age > 30) return { ok: false, error: `${firstName}: anul nașterii nu pare corect.` };
        children.push({ firstName, lastName, birthDate: `${year}-01-01` });
    }
    return { ok: true, value: children };
}

/** "Ștefan  POPESCU" → "stefan popescu" — diacritics (ș/ş, ț/ţ, ă, â, î) folded. */
export function foldName(value: string | null | undefined) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z\s-]/g, '')
        .replace(/[\s-]+/g, ' ')
        .trim();
}

export type MatchCandidate = { id: number; firstName: string | null; lastName: string | null; birthYear: number | null };

/**
 * Existing players that are probably this child, best first. A name match in
 * either order counts ("Popescu Matei" = "Matei Popescu"); a different birth
 * year rules a candidate out, a missing one does not.
 */
export function suggestPlayerMatches<T extends MatchCandidate>(child: { firstName: string; lastName: string; birthDate: string | null }, candidates: T[]) {
    const first = foldName(child.firstName);
    const last = foldName(child.lastName);
    const year = child.birthDate ? Number(child.birthDate.slice(0, 4)) : null;

    return candidates
        .map((candidate) => {
            const cFirst = foldName(candidate.firstName);
            const cLast = foldName(candidate.lastName);
            const exact = (cFirst === first && cLast === last) || (cFirst === last && cLast === first);
            const partial = !exact && cLast === last && (cFirst.startsWith(first) || first.startsWith(cFirst)) && cFirst.length > 0;
            const yearKnown = candidate.birthYear != null && year != null;
            const sameYear = yearKnown && candidate.birthYear === year;
            return { candidate, exact, partial, sameYear, yearConflict: yearKnown && !sameYear };
        })
        .filter((m) => (m.exact || m.partial) && !m.yearConflict)
        .sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.sameYear) - Number(a.sameYear))
        .map((m) => ({ ...m.candidate, exact: m.exact, sameBirthYear: m.sameYear }));
}

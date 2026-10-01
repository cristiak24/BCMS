/**
 * Contact book rules (routes/contacts.ts) — pure and tested.
 */

/** Roles that see families' numbers and edit them. */
const CONTACT_STAFF_ROLES = new Set(['admin', 'superadmin', 'coach']);

export function isContactStaff(role: unknown) {
    return CONTACT_STAFF_ROLES.has(String(role ?? ''));
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * A phone as people type it: digits with optional leading +, spaces, dots,
 * dashes and parentheses. Empty → null (clears the field).
 */
export function normalizePhone(value: unknown, label: string): Result<string | null> {
    if (value == null) return { ok: true, value: null };
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (!text) return { ok: true, value: null };
    if (!/^\+?[0-9 ().-]{6,32}$/.test(text)) return { ok: false, error: `${label}: număr de telefon invalid.` };
    const digits = text.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 15) return { ok: false, error: `${label}: număr de telefon invalid.` };
    return { ok: true, value: text };
}

function cleanName(value: unknown) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    return text || null;
}

export type PlayerContactInput = {
    phone: string | null;
    guardianName: string | null;
    guardianPhone: string | null;
    guardian2Name: string | null;
    guardian2Phone: string | null;
};

export function parsePlayerContact(body: unknown): Result<PlayerContactInput> {
    const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const phone = normalizePhone(raw.phone, 'Telefon jucător');
    if (!phone.ok) return phone;
    const guardianPhone = normalizePhone(raw.guardianPhone, 'Telefon părinte 1');
    if (!guardianPhone.ok) return guardianPhone;
    const guardian2Phone = normalizePhone(raw.guardian2Phone, 'Telefon părinte 2');
    if (!guardian2Phone.ok) return guardian2Phone;
    return {
        ok: true,
        value: {
            phone: phone.value,
            guardianName: cleanName(raw.guardianName),
            guardianPhone: guardianPhone.value,
            guardian2Name: cleanName(raw.guardian2Name),
            guardian2Phone: guardian2Phone.value,
        },
    };
}

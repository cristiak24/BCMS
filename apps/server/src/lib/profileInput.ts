/**
 * PATCH /api/profile/me field rules (routes/profile.ts) — pure, see
 * profileInput.test.ts. An empty first name ("" → the name became just
 * "Popescu") and any language string ("klingon") used to be stored (R3-21).
 */

/** What the profile's language picker offers (components/profile/ProfileForm.tsx). */
export const PROFILE_LANGUAGES = ['ro', 'en'] as const;

type Check = { ok: true } | { ok: false; error: string };

export function checkProfileFields(fields: { firstName?: string; lastName?: string; preferredLanguage?: string | null }): Check {
    if (fields.firstName !== undefined && !fields.firstName.trim()) {
        return { ok: false, error: 'Prenumele nu poate fi gol.' };
    }
    if (fields.lastName !== undefined && !fields.lastName.trim()) {
        return { ok: false, error: 'Numele nu poate fi gol.' };
    }
    const language = fields.preferredLanguage;
    if (typeof language === 'string' && language.trim() && !(PROFILE_LANGUAGES as readonly string[]).includes(language.trim().toLowerCase())) {
        return { ok: false, error: 'Limba aleasă nu este disponibilă.' };
    }
    return { ok: true };
}

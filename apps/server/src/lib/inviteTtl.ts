/**
 * How long an emailed invitation stays valid — one value for sending and for
 * the superadmin settings screen (which used to show 168 h while links died
 * after 10 minutes). See inviteTtl.test.ts.
 *
 * INVITE_TTL_HOURS wins; INVITE_EXPIRATION_MINUTES is the older name. Either
 * way it is kept between 24 hours and 30 days: people open invitation emails
 * hours or days later, so a shorter link is simply unusable.
 */
const DEFAULT_HOURS = 7 * 24;
const MIN_MINUTES = 24 * 60;
const MAX_MINUTES = 30 * 24 * 60;

export function inviteTtlMinutes(env: Record<string, string | undefined>) {
    const hours = Number(env.INVITE_TTL_HOURS);
    const minutes = Number(env.INVITE_EXPIRATION_MINUTES);
    const raw = Number.isFinite(hours) && hours > 0
        ? hours * 60
        : Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_HOURS * 60;
    return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(raw)));
}

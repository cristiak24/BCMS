"use strict";
/**
 * Classification rules for the contaminated-settings audit.
 *
 * A now-fixed bug in `seedSettingsData` seeded every newly onboarded club from club 1's
 * real fees, so clubs created before the fix may still be charging another club's
 * prices. No audit trail exists for `financial_settings`, which is why contamination can
 * only ever be *inferred* here — from the values themselves and from how soon after the
 * club was created they were last written. Every verdict this module produces is a
 * heuristic for a human to review, never an instruction to change anything.
 *
 * Kept free of any store or network dependency so the rules can be unit-tested.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINGERPRINT_FIELDS = exports.SEED_PROXIMITY_MS = exports.REFERENCE_CLUB_ID = void 0;
exports.normalizeAmount = normalizeAmount;
exports.amountsEqual = amountsEqual;
exports.classifySettings = classifySettings;
exports.REFERENCE_CLUB_ID = 1;
/**
 * How close a settings write has to be to club creation to read as "seeded, never
 * touched". The boundary is INCLUSIVE: exactly 5 minutes counts as seeded.
 *
 * Erring toward flagging is deliberate. A false flag costs a human one look at a club;
 * a false clear leaves real parents being charged another club's fees indefinitely.
 */
exports.SEED_PROXIMITY_MS = 5 * 60 * 1000;
/** The three fees that seeding copied together, and therefore the fingerprint. */
exports.FINGERPRINT_FIELDS = ['monthlyPlayerFee', 'trainingLevy', 'facilityFee'];
/** Also compared across stores, but not part of the contamination fingerprint. */
const CROSS_STORE_FIELDS = [...exports.FINGERPRINT_FIELDS, 'paymentDueDay'];
/**
 * Normalise a stored money value while PRESERVING the difference between absent, null
 * and zero.
 *
 * Collapsing those together is how an audit misclassifies: a club with no fee set is not
 * a club charging 0, and neither is a club whose fee happens to equal the reference.
 * Unparseable input becomes NaN and never compares equal to anything.
 */
function normalizeAmount(value) {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    if (typeof value === 'string' && value.trim() === '') {
        return NaN;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.round(parsed) : NaN;
}
function amountsEqual(left, right) {
    const a = normalizeAmount(left);
    const b = normalizeAmount(right);
    if (typeof a === 'number' && typeof b === 'number') {
        // NaN means "could not be read as an amount" and must never match, not even
        // another unreadable value.
        return Number.isFinite(a) && Number.isFinite(b) && a === b;
    }
    // null vs undefined stays unequal here, which is the point.
    return a === b;
}
function toTimestamp(value) {
    if (value == null) {
        return null;
    }
    // Firestore Timestamps arrive as objects exposing toDate().
    const candidate = typeof value.toDate === 'function'
        ? value.toDate()
        : value;
    const date = candidate instanceof Date ? candidate : new Date(candidate);
    const time = date.getTime();
    return Number.isFinite(time) ? time : null;
}
function snapshotsAgree(left, right) {
    return CROSS_STORE_FIELDS.every((field) => amountsEqual(left[field], right[field]));
}
function classifySettings(reference, club, clubCreatedAt) {
    var _a, _b;
    const fromFirestore = (_a = club.firestore) !== null && _a !== void 0 ? _a : null;
    const fromPostgres = (_b = club.postgres) !== null && _b !== void 0 ? _b : null;
    // Only a genuine disagreement counts. One store simply not holding a copy is the
    // normal state, not a finding.
    const storeMismatch = fromFirestore !== null
        && fromPostgres !== null
        && !snapshotsAgree(fromFirestore, fromPostgres);
    const source = fromFirestore ? 'firestore' : fromPostgres ? 'postgres' : 'none';
    if (club.clubId === exports.REFERENCE_CLUB_ID) {
        return {
            bucket: 'REFERENCE_CLUB',
            contamination: 'NOT_APPLICABLE',
            storeMismatch,
            source,
            reason: 'Club 1 is the contamination source, so its own values are the reference rather than a finding.',
        };
    }
    const bucketFor = (contamination) => storeMismatch ? 'STORE_MISMATCH' : contamination;
    const effective = fromFirestore !== null && fromFirestore !== void 0 ? fromFirestore : fromPostgres;
    if (!effective) {
        return {
            bucket: bucketFor('NO_SETTINGS'),
            contamination: 'NO_SETTINGS',
            storeMismatch,
            source: 'none',
            reason: 'No settings document or row exists for this club, so nothing was ever seeded.',
        };
    }
    if (!reference) {
        return {
            bucket: bucketFor('CLEAN'),
            contamination: 'CLEAN',
            storeMismatch,
            source,
            reason: 'No reference fingerprint is available, so contamination cannot be assessed for this club.',
        };
    }
    const feesMatchReference = exports.FINGERPRINT_FIELDS.every((field) => amountsEqual(effective[field], reference[field]));
    if (!feesMatchReference) {
        return {
            bucket: bucketFor('CLEAN'),
            contamination: 'CLEAN',
            storeMismatch,
            source,
            reason: 'At least one fee differs from the reference, so these values were not inherited wholesale.',
        };
    }
    const updatedAt = toTimestamp(effective.updatedAt);
    const createdAt = toTimestamp(clubCreatedAt);
    if (updatedAt == null || createdAt == null) {
        return {
            bucket: bucketFor('POSSIBLY_CONTAMINATED'),
            contamination: 'POSSIBLY_CONTAMINATED',
            storeMismatch,
            source,
            reason: 'Fees match the reference but a missing timestamp makes it impossible to tell seeded from chosen.',
        };
    }
    // Absolute difference, so clock skew that puts the write marginally before club
    // creation still reads as "written at onboarding".
    const distance = Math.abs(updatedAt - createdAt);
    if (distance <= exports.SEED_PROXIMITY_MS) {
        return {
            bucket: bucketFor('LIKELY_CONTAMINATED'),
            contamination: 'LIKELY_CONTAMINATED',
            storeMismatch,
            source,
            reason: 'Fees match the reference and were last written at club creation, so they look seeded and never reviewed.',
        };
    }
    return {
        bucket: bucketFor('POSSIBLY_CONTAMINATED'),
        contamination: 'POSSIBLY_CONTAMINATED',
        storeMismatch,
        source,
        reason: 'Fees match the reference but were written well after club creation, so a human may have chosen them.',
    };
}

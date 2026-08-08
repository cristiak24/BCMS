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

export const REFERENCE_CLUB_ID = 1;

/**
 * How close a settings write has to be to club creation to read as "seeded, never
 * touched". The boundary is INCLUSIVE: exactly 5 minutes counts as seeded.
 *
 * Erring toward flagging is deliberate. A false flag costs a human one look at a club;
 * a false clear leaves real parents being charged another club's fees indefinitely.
 */
export const SEED_PROXIMITY_MS = 5 * 60 * 1000;

/** The three fees that seeding copied together, and therefore the fingerprint. */
export const FINGERPRINT_FIELDS = ['monthlyPlayerFee', 'trainingLevy', 'facilityFee'] as const;

/** Also compared across stores, but not part of the contamination fingerprint. */
const CROSS_STORE_FIELDS = [...FINGERPRINT_FIELDS, 'paymentDueDay'] as const;

export type FeeSnapshot = {
    monthlyPlayerFee?: unknown;
    trainingLevy?: unknown;
    facilityFee?: unknown;
    paymentDueDay?: unknown;
    updatedAt?: unknown;
};

export type ClubSettingsSnapshot = {
    clubId: number;
    firestore: FeeSnapshot | null;
    postgres: FeeSnapshot | null;
};

export type ContaminationBucket =
    | 'NO_SETTINGS'
    | 'LIKELY_CONTAMINATED'
    | 'POSSIBLY_CONTAMINATED'
    | 'CLEAN'
    | 'NOT_APPLICABLE';

export type AuditBucket = ContaminationBucket | 'STORE_MISMATCH' | 'REFERENCE_CLUB';

export type SettingsSource = 'firestore' | 'postgres' | 'none';

export type Classification = {
    /** Primary grouping bucket for the report. */
    bucket: AuditBucket;
    /** The contamination verdict, preserved even when the row groups under STORE_MISMATCH. */
    contamination: ContaminationBucket;
    storeMismatch: boolean;
    source: SettingsSource;
    reason: string;
};

/**
 * Normalise a stored money value while PRESERVING the difference between absent, null
 * and zero.
 *
 * Collapsing those together is how an audit misclassifies: a club with no fee set is not
 * a club charging 0, and neither is a club whose fee happens to equal the reference.
 * Unparseable input becomes NaN and never compares equal to anything.
 */
export function normalizeAmount(value: unknown): number | null | undefined {
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

export function amountsEqual(left: unknown, right: unknown): boolean {
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

function toTimestamp(value: unknown): number | null {
    if (value == null) {
        return null;
    }

    // Firestore Timestamps arrive as objects exposing toDate().
    const candidate = typeof (value as { toDate?: unknown }).toDate === 'function'
        ? (value as { toDate: () => Date }).toDate()
        : value;

    const date = candidate instanceof Date ? candidate : new Date(candidate as string | number);
    const time = date.getTime();

    return Number.isFinite(time) ? time : null;
}

function snapshotsAgree(left: FeeSnapshot, right: FeeSnapshot): boolean {
    return CROSS_STORE_FIELDS.every((field) => amountsEqual(left[field], right[field]));
}

export function classifySettings(
    reference: FeeSnapshot | null | undefined,
    club: ClubSettingsSnapshot,
    clubCreatedAt: unknown,
): Classification {
    const fromFirestore = club.firestore ?? null;
    const fromPostgres = club.postgres ?? null;

    // Only a genuine disagreement counts. One store simply not holding a copy is the
    // normal state, not a finding.
    const storeMismatch = fromFirestore !== null
        && fromPostgres !== null
        && !snapshotsAgree(fromFirestore, fromPostgres);

    const source: SettingsSource = fromFirestore ? 'firestore' : fromPostgres ? 'postgres' : 'none';

    if (club.clubId === REFERENCE_CLUB_ID) {
        return {
            bucket: 'REFERENCE_CLUB',
            contamination: 'NOT_APPLICABLE',
            storeMismatch,
            source,
            reason: 'Club 1 is the contamination source, so its own values are the reference rather than a finding.',
        };
    }

    const bucketFor = (contamination: ContaminationBucket): AuditBucket =>
        storeMismatch ? 'STORE_MISMATCH' : contamination;

    const effective = fromFirestore ?? fromPostgres;

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

    const feesMatchReference = FINGERPRINT_FIELDS.every(
        (field) => amountsEqual(effective[field], reference[field]),
    );

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

    if (distance <= SEED_PROXIMITY_MS) {
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

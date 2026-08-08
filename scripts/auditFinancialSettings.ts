/**
 * READ-ONLY audit for cross-club finance-settings contamination.
 *
 * A now-fixed bug in `seedSettingsData` seeded every newly onboarded club from legacy
 * document `financialSettings/1` — club 1's real fees. Clubs onboarded before the fix
 * may still be charging parents another club's prices. `financial_settings` has no
 * audit trail, so contamination can only be inferred; this script gathers the evidence
 * and hands it to a human.
 *
 * THIS SCRIPT NEVER WRITES TO FIRESTORE OR POSTGRES. It has no --fix mode and no
 * remediation path, deliberately. The only thing it writes is a JSON report on the
 * local filesystem. Every remediation decision is made per club by a person.
 *
 * Usage:  npx tsx scripts/auditFinancialSettings.ts
 */

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../apps/server/src/db';
import { clubs, financialSettings } from '../apps/server/src/db/schema';
import {
    classifySettings,
    REFERENCE_CLUB_ID,
    SEED_PROXIMITY_MS,
    type AuditBucket,
    type Classification,
    type FeeSnapshot,
} from '../apps/server/src/lib/settingsAudit';

type ServiceAccountJson = {
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
};

type ClubRow = {
    id: number;
    name: string;
    createdAt: string;
};

type AuditRow = {
    clubId: number;
    clubName: string;
    clubCreatedAt: string;
    bucket: AuditBucket;
    contamination: Classification['contamination'];
    storeMismatch: boolean;
    source: Classification['source'];
    reason: string;
    firestore: FeeSnapshot | null;
    postgres: FeeSnapshot | null;
    error?: string;
};

const DEFAULT_OUTPUT_DIR = '/private/tmp/claude-501/-Users-baramariuscristianvalentin-BCMS/2b547149-63ef-45f2-a904-aeb9472c2e08/scratchpad';

const BUCKET_ORDER: AuditBucket[] = [
    'LIKELY_CONTAMINATED',
    'POSSIBLY_CONTAMINATED',
    'STORE_MISMATCH',
    'CLEAN',
    'NO_SETTINGS',
    'REFERENCE_CLUB',
    'NOT_APPLICABLE',
];

function readEnv(name: string, fallback = '') {
    return (process.env[name] ?? fallback).trim();
}

/**
 * Credentials must be proven present before any club is examined. A run that cannot
 * reach a store would otherwise find no settings anywhere and report every club as
 * clean — the single most dangerous possible output of an audit like this.
 */
function assertPrerequisites() {
    const problems: string[] = [];

    if (!readEnv('DATABASE_URL')) {
        problems.push(
            'DATABASE_URL is not set. Point it at the Neon connection string for the environment you are auditing.',
        );
    }

    const hasServiceAccountJson = Boolean(readEnv('FIREBASE_SERVICE_ACCOUNT_KEY'));
    const hasInlineCredentials = Boolean(readEnv('FIREBASE_CLIENT_EMAIL') && readEnv('FIREBASE_PRIVATE_KEY'));
    const hasAdc = Boolean(readEnv('GOOGLE_APPLICATION_CREDENTIALS'));
    const scriptsDir = path.resolve(process.cwd(), 'scripts');
    const hasKeyFile = fs.existsSync(scriptsDir)
        && fs.readdirSync(scriptsDir).some((file) => file.startsWith('bcms') && file.endsWith('.json'));

    if (!hasServiceAccountJson && !hasInlineCredentials && !hasAdc && !hasKeyFile) {
        problems.push(
            'No Firebase Admin credentials found. Set FIREBASE_SERVICE_ACCOUNT_KEY (full JSON), or '
            + 'FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY, or GOOGLE_APPLICATION_CREDENTIALS, or place the '
            + 'bcms-*.json service account file in ./scripts.',
        );
    }

    if (!readEnv('FIREBASE_PROJECT_ID') && !readEnv('GCLOUD_PROJECT') && !hasServiceAccountJson && !hasKeyFile) {
        problems.push('FIREBASE_PROJECT_ID is not set and no service account file supplies a project id.');
    }

    if (problems.length > 0) {
        console.error('\nCannot start the audit — required configuration is missing:\n');
        for (const problem of problems) {
            console.error(`  • ${problem}`);
        }
        console.error(
            '\nRefusing to continue. A partial run would report clubs as CLEAN simply because their '
            + 'settings could not be read.\n',
        );
        process.exit(1);
    }
}

function loadCredential() {
    const rawServiceAccount = readEnv('FIREBASE_SERVICE_ACCOUNT_KEY');

    if (rawServiceAccount) {
        const parsed = JSON.parse(rawServiceAccount) as ServiceAccountJson;

        if (!parsed.clientEmail || !parsed.privateKey) {
            throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY must include clientEmail and privateKey.');
        }

        return cert({
            projectId: parsed.projectId || readEnv('FIREBASE_PROJECT_ID') || undefined,
            clientEmail: parsed.clientEmail,
            privateKey: parsed.privateKey.replace(/\\n/g, '\n'),
        });
    }

    const inlineClientEmail = readEnv('FIREBASE_CLIENT_EMAIL');
    const inlinePrivateKey = readEnv('FIREBASE_PRIVATE_KEY');
    if (inlineClientEmail && inlinePrivateKey) {
        return cert({
            projectId: readEnv('FIREBASE_PROJECT_ID') || undefined,
            clientEmail: inlineClientEmail,
            privateKey: inlinePrivateKey.replace(/\\n/g, '\n'),
        });
    }

    const scriptsDir = path.resolve(process.cwd(), 'scripts');
    if (fs.existsSync(scriptsDir)) {
        const files = fs.readdirSync(scriptsDir);
        const jsonFile = files.find((file) => file.startsWith('bcms') && file.endsWith('.json'));
        if (jsonFile) {
            // Filename only — never the contents.
            console.log(`Using service account JSON: ${jsonFile}`);
            return cert(path.join(scriptsDir, jsonFile));
        }
    }

    return applicationDefault();
}

function toIsoOrNull(value: unknown): string | null {
    if (value == null) {
        return null;
    }

    const candidate = typeof (value as { toDate?: unknown }).toDate === 'function'
        ? (value as { toDate: () => Date }).toDate()
        : value;
    const date = candidate instanceof Date ? candidate : new Date(candidate as string | number);

    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Only the fields the audit reasons about — never the whole document. */
function toFeeSnapshot(source: Record<string, unknown> | null | undefined): FeeSnapshot | null {
    if (!source) {
        return null;
    }

    return {
        monthlyPlayerFee: source.monthlyPlayerFee,
        trainingLevy: source.trainingLevy,
        facilityFee: source.facilityFee,
        paymentDueDay: source.paymentDueDay,
        updatedAt: toIsoOrNull(source.updatedAt),
    };
}

function settingsDocId(clubId: number) {
    return `club:${clubId}`;
}

async function readFirestoreSettings(docId: string): Promise<FeeSnapshot | null> {
    const snap = await getFirestore().collection('financialSettings').doc(docId).get();
    return snap.exists ? toFeeSnapshot(snap.data() as Record<string, unknown>) : null;
}

async function readPostgresSettings(rowId: number): Promise<FeeSnapshot | null> {
    const rows = await db.select().from(financialSettings).where(eq(financialSettings.id, rowId)).limit(1);
    return rows[0] ? toFeeSnapshot(rows[0] as unknown as Record<string, unknown>) : null;
}

function formatAmount(value: unknown): string {
    if (value === undefined) {
        return '—';
    }
    if (value === null) {
        return 'null';
    }
    return String(value);
}

function formatSnapshot(snapshot: FeeSnapshot | null): string {
    if (!snapshot) {
        return 'none';
    }

    return `fee=${formatAmount(snapshot.monthlyPlayerFee)} levy=${formatAmount(snapshot.trainingLevy)} `
        + `facility=${formatAmount(snapshot.facilityFee)} due=${formatAmount(snapshot.paymentDueDay)}`;
}

function printRow(row: AuditRow) {
    const primary = row.source === 'postgres' ? row.postgres : row.firestore;

    console.log(
        `  #${String(row.clubId).padEnd(5)} ${row.clubName.slice(0, 34).padEnd(34)} `
        + `created=${(row.clubCreatedAt ?? '—').slice(0, 19).padEnd(19)} src=${row.source.padEnd(9)}`,
    );
    console.log(`         ${formatSnapshot(primary)}  updatedAt=${formatAmount(primary?.updatedAt)}`);

    if (row.storeMismatch) {
        console.log(`         STORE MISMATCH — firestore: ${formatSnapshot(row.firestore)}`);
        console.log(`                          postgres:  ${formatSnapshot(row.postgres)}`);
    }

    if (row.error) {
        console.log(`         ERROR: ${row.error}`);
    }

    console.log(`         ${row.reason}`);
}

function printClosingCaveats() {
    console.log('\n' + '='.repeat(100));
    console.log('HOW TO READ THIS REPORT');
    console.log('='.repeat(100));
    console.log(`
These buckets are HEURISTIC. They are not proof.

There is no audit trail for financial_settings, so nothing records who set a club's fees
or when they were first written. Every verdict above is inferred from two things only:
whether the fees exactly match club 1's legacy values, and whether they were last written
within ${SEED_PROXIMITY_MS / 60000} minutes of the club being created.

That means:

  • A club may have LEGITIMATELY CHOSEN the same fees as club 1. Identical values are not
    evidence of contamination on their own.
  • A contaminated club whose admin later opened and saved the finance screen will appear
    as POSSIBLY_CONTAMINATED, or even CLEAN if they changed a fee.
  • A club created by a data import rather than the normal onboarding flow may show
    timestamps that make a clean club look seeded.

EVERY REMEDIATION DECISION MUST BE MADE PER CLUB BY A HUMAN.

Confirm with the club before altering live pricing. Check player_payments for charges
already issued against the suspect fees — a club that has already billed parents needs a
refund decision, not just a corrected configuration.

This script has changed nothing. It has no --fix mode by design.
`);
}

async function main() {
    assertPrerequisites();

    if (!getApps().length) {
        initializeApp({
            credential: loadCredential(),
            projectId: readEnv('FIREBASE_PROJECT_ID') || undefined,
        });
    }

    const startedAt = new Date();
    console.log('\n' + '='.repeat(100));
    console.log('BCMS — FINANCIAL SETTINGS CONTAMINATION AUDIT (READ ONLY)');
    console.log(`Started ${startedAt.toISOString()}`);
    console.log('='.repeat(100));

    // ---- Reference fingerprint -------------------------------------------------
    let reference: FeeSnapshot | null = null;
    let referenceSource: 'firestore' | 'postgres' | 'none' = 'none';

    try {
        reference = await readFirestoreSettings(String(REFERENCE_CLUB_ID));
        if (reference) {
            referenceSource = 'firestore';
        }
    } catch (error) {
        console.error(`  ! Could not read Firestore financialSettings/1: ${(error as Error).message}`);
    }

    if (!reference) {
        try {
            reference = await readPostgresSettings(REFERENCE_CLUB_ID);
            if (reference) {
                referenceSource = 'postgres';
            }
        } catch (error) {
            console.error(`  ! Could not read Postgres financial_settings id=1: ${(error as Error).message}`);
        }
    }

    console.log('\nREFERENCE (club 1 legacy) — the fingerprint of contamination');
    console.log('-'.repeat(100));

    if (reference) {
        console.log(`  source: ${referenceSource}`);
        console.log(`  ${formatSnapshot(reference)}`);
        console.log(`  updatedAt=${formatAmount(reference.updatedAt)}`);
        console.log('\n  Any club below whose three fees match these exactly is a contamination candidate.');
    } else {
        console.log('  !! NO REFERENCE FOUND — neither financialSettings/1 nor financial_settings id=1 exists.');
        console.log('  !! Contamination CANNOT be assessed. Every club will report CLEAN for lack of a');
        console.log('  !! fingerprint, which is an absence of evidence, NOT evidence of absence.');
    }

    // ---- Clubs -----------------------------------------------------------------
    const clubRows = await db
        .select({ id: clubs.id, name: clubs.name, createdAt: clubs.createdAt })
        .from(clubs)
        .orderBy(clubs.id) as ClubRow[];

    console.log(`\nExamining ${clubRows.length} club(s).`);

    const results: AuditRow[] = [];

    for (const clubRow of clubRows) {
        let firestoreSettings: FeeSnapshot | null = null;
        let postgresSettings: FeeSnapshot | null = null;
        let failure: string | undefined;

        try {
            firestoreSettings = await readFirestoreSettings(settingsDocId(clubRow.id));
        } catch (error) {
            failure = `Firestore read failed: ${(error as Error).message}`;
        }

        try {
            postgresSettings = await readPostgresSettings(clubRow.id);
        } catch (error) {
            failure = failure
                ? `${failure}; Postgres read failed: ${(error as Error).message}`
                : `Postgres read failed: ${(error as Error).message}`;
        }

        // A single unreadable club must not abort the run, but it must never be
        // silently reported as clean either.
        if (failure) {
            results.push({
                clubId: clubRow.id,
                clubName: clubRow.name,
                clubCreatedAt: clubRow.createdAt,
                bucket: 'NOT_APPLICABLE',
                contamination: 'NOT_APPLICABLE',
                storeMismatch: false,
                source: 'none',
                reason: 'Settings could not be read, so this club was NOT assessed. Re-run before drawing conclusions.',
                firestore: firestoreSettings,
                postgres: postgresSettings,
                error: failure,
            });
            continue;
        }

        const classification = classifySettings(
            reference,
            { clubId: clubRow.id, firestore: firestoreSettings, postgres: postgresSettings },
            clubRow.createdAt,
        );

        results.push({
            clubId: clubRow.id,
            clubName: clubRow.name,
            clubCreatedAt: clubRow.createdAt,
            bucket: classification.bucket,
            contamination: classification.contamination,
            storeMismatch: classification.storeMismatch,
            source: classification.source,
            reason: classification.reason,
            firestore: firestoreSettings,
            postgres: postgresSettings,
        });
    }

    // ---- Grouped output --------------------------------------------------------
    const errorRows = results.filter((row) => row.error);
    const bucketsPresent = BUCKET_ORDER.filter((bucket) =>
        results.some((row) => row.bucket === bucket && !row.error));

    for (const bucket of bucketsPresent) {
        const rows = results.filter((row) => row.bucket === bucket && !row.error);
        console.log('\n' + '='.repeat(100));
        console.log(`${bucket}  (${rows.length})`);
        console.log('='.repeat(100));
        for (const row of rows) {
            printRow(row);
        }
    }

    if (errorRows.length > 0) {
        console.log('\n' + '='.repeat(100));
        console.log(`ERROR  (${errorRows.length})  — these clubs were NOT assessed`);
        console.log('='.repeat(100));
        for (const row of errorRows) {
            printRow(row);
        }
    }

    // ---- Summary ---------------------------------------------------------------
    console.log('\n' + '='.repeat(100));
    console.log('SUMMARY');
    console.log('='.repeat(100));

    const counts: Record<string, number> = {};
    for (const bucket of BUCKET_ORDER) {
        const total = results.filter((row) => row.bucket === bucket && !row.error).length;
        if (total > 0) {
            counts[bucket] = total;
        }
    }
    if (errorRows.length > 0) {
        counts.ERROR = errorRows.length;
    }

    for (const [bucket, total] of Object.entries(counts)) {
        console.log(`  ${bucket.padEnd(24)} ${total}`);
    }
    console.log(`  ${'TOTAL CLUBS'.padEnd(24)} ${clubRows.length}`);

    // ---- Durable record --------------------------------------------------------
    const outputDir = readEnv('AUDIT_OUTPUT_DIR') || DEFAULT_OUTPUT_DIR;
    let reportPath: string | null = null;

    try {
        fs.mkdirSync(outputDir, { recursive: true });
        reportPath = path.join(outputDir, `financial-settings-audit-${startedAt.toISOString()}.json`);
        fs.writeFileSync(
            reportPath,
            JSON.stringify(
                {
                    generatedAt: startedAt.toISOString(),
                    readOnly: true,
                    seedProximityMs: SEED_PROXIMITY_MS,
                    reference: { source: referenceSource, values: reference },
                    counts,
                    totalClubs: clubRows.length,
                    clubs: results,
                },
                null,
                2,
            ),
            'utf8',
        );
        console.log(`\nJSON report written to:\n  ${reportPath}`);
    } catch (error) {
        console.error(`\n! Could not write the JSON report to ${outputDir}: ${(error as Error).message}`);
        console.error('! The findings above are still valid — capture this terminal output instead.');
    }

    printClosingCaveats();
}

main()
    .catch((error) => {
        console.error('Financial settings audit failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        // Let the process exit instead of hanging on the pg pool.
        const { pool } = await import('../apps/server/src/db');
        await pool.end().catch(() => undefined);
    });

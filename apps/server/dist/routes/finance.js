"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripeWebhookHandler = stripeWebhookHandler;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const stripe_1 = __importDefault(require("stripe"));
const firebaseAdmin_1 = require("../lib/firebaseAdmin");
const requestContext_1 = require("../lib/requestContext");
const requestAuth_1 = require("../lib/requestAuth");
const financeDefaults_1 = require("../lib/financeDefaults");
const auth_1 = require("../middleware/auth");
const auditService_1 = require("../services/auditService");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
const router = (0, express_1.Router)();
// Every finance endpoint requires a verified Firebase ID token. Per-route checks
// below narrow this further (admin/accountant vs. the player's own data). The
// Stripe webhook is mounted separately in app.ts, before this router, because it
// authenticates via the Stripe signature instead.
router.use(auth_1.authenticate);
/**
 * Audit logging must never cost a user a mutation that already succeeded.
 *
 * `writeAuditLog` does not swallow its own failures, and the existing call sites in
 * clubAdmin/manageAccess leave it unwrapped — so there, a failed audit insert surfaces
 * as a 500 on a change that has already been committed. Money is the wrong surface on
 * which to repeat that: the record is written on a best-effort basis and a failure is
 * loud in the logs but invisible to the caller.
 */
function recordFinanceAudit(input) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield (0, auditService_1.writeAuditLog)(input);
        }
        catch (error) {
            console.error(`[finance/audit] Failed to record ${input.action}:`, error);
        }
    });
}
/**
 * Actor fields for an audit row, sourced only from the verified Bearer identity that
 * `authenticate` attached. Never from client-supplied headers.
 */
/** Fee fields worth a before/after record. All are inputs to real Stripe amounts. */
const AUDITED_SETTINGS_FIELDS = [
    'monthlyPlayerFee',
    'trainingLevy',
    'facilityFee',
    'paymentDueDay',
    'autoAdjust',
];
function settingsAuditChanges(before, updates) {
    var _a;
    const changes = {};
    for (const field of AUDITED_SETTINGS_FIELDS) {
        // Only fields this request actually set — an untouched fee is not a change.
        if (updates[field] === undefined) {
            continue;
        }
        changes[field] = { before: (_a = before === null || before === void 0 ? void 0 : before[field]) !== null && _a !== void 0 ? _a : null, after: updates[field] };
    }
    return changes;
}
function financeAuditActor(req) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const authed = req;
    return {
        actorUserId: (_b = (_a = authed.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null,
        actorUid: (_d = (_c = authed.firebaseUser) === null || _c === void 0 ? void 0 : _c.uid) !== null && _d !== void 0 ? _d : null,
        actorRole: (_f = (_e = authed.user) === null || _e === void 0 ? void 0 : _e.role) !== null && _f !== void 0 ? _f : null,
        ipAddress: (_g = req.ip) !== null && _g !== void 0 ? _g : null,
        userAgent: (_h = req.get('user-agent')) !== null && _h !== void 0 ? _h : null,
    };
}
const DEFAULT_STRIPE_PUBLISHABLE_KEY = 'pk_test_51TP7NnCFpLYWSHx5i7EAuPRWUXgoP0lxHFIqDIGvyQOpNIbu4VOg2IMg7H8LW5HgTslJVudDxe3xnGXgRIubcVbA00swDdrRS0';
const DEFAULT_PAYMENT_CURRENCY = (process.env.STRIPE_CURRENCY || 'ron').trim().toLowerCase();
const FINANCE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_FINANCE_UPLOAD_MIME_TYPES = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
]);
const ALLOWED_FINANCE_UPLOAD_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp']);
const ZERO_DECIMAL_CURRENCIES = new Set([
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga',
    'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
]);
let stripeClient = null;
function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}
function getStripePublishableKey() {
    var _a;
    return ((_a = process.env.STRIPE_PUBLISHABLE_KEY) === null || _a === void 0 ? void 0 : _a.trim()) || DEFAULT_STRIPE_PUBLISHABLE_KEY;
}
function getStripe() {
    var _a;
    const secretKey = (_a = process.env.STRIPE_SECRET_KEY) === null || _a === void 0 ? void 0 : _a.trim();
    if (!secretKey) {
        throw new Error('Stripe is not configured. STRIPE_SECRET_KEY is missing.');
    }
    if (!stripeClient) {
        stripeClient = new stripe_1.default(secretKey);
    }
    return stripeClient;
}
function getStripeIfConfigured() {
    try {
        return getStripe();
    }
    catch (_a) {
        return null;
    }
}
function normalizeStatus(status) {
    return String(status !== null && status !== void 0 ? status : '').trim().toLowerCase();
}
function isPaidStatus(status) {
    const normalized = normalizeStatus(status);
    return normalized === 'paid' || normalized === 'processed' || normalized === 'succeeded' || normalized === 'success';
}
function isFailedStatus(status) {
    const normalized = normalizeStatus(status);
    return normalized === 'failed' || normalized === 'error' || normalized === 'rejected';
}
function asPositiveAmount(value) {
    const amount = Number(value !== null && value !== void 0 ? value : 0);
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
}
function toMinorUnits(amount, currency) {
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
        ? Math.round(amount)
        : Math.round(amount * 100);
}
function fromMinorUnits(amount, currency) {
    const value = Number(amount !== null && amount !== void 0 ? amount : 0);
    return ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? value : value / 100;
}
function isFirestoreNotFound(error) {
    return Boolean(error &&
        typeof error === 'object' &&
        'code' in error &&
        Number(error.code) === 5);
}
/**
 * True for Firestore failures that mean "this environment can't reach Firestore"
 * rather than "this document doesn't exist" — missing/!broken Application
 * Default Credentials, and the gRPC UNAVAILABLE (14) / DEADLINE_EXCEEDED (4)
 * codes. These are recoverable here because every caller has a Postgres path.
 */
function isFirestoreUnavailable(error) {
    var _a;
    if (!error || typeof error !== 'object') {
        return false;
    }
    const code = Number(error.code);
    if (code === 14 || code === 4) {
        return true;
    }
    const message = String((_a = error.message) !== null && _a !== void 0 ? _a : '').toLowerCase();
    return message.includes('default credentials')
        || message.includes('could not refresh access token')
        || message.includes('unable to detect a project id');
}
function canUseFirestoreDocuments() {
    var _a, _b, _c, _d;
    return Boolean(((_a = process.env.FIREBASE_SERVICE_ACCOUNT_JSON) === null || _a === void 0 ? void 0 : _a.trim()) ||
        (((_b = process.env.FIREBASE_CLIENT_EMAIL) === null || _b === void 0 ? void 0 : _b.trim()) && ((_c = process.env.FIREBASE_PRIVATE_KEY) === null || _c === void 0 ? void 0 : _c.trim())) ||
        ((_d = process.env.GOOGLE_APPLICATION_CREDENTIALS) === null || _d === void 0 ? void 0 : _d.trim()) ||
        process.env.K_SERVICE ||
        process.env.FUNCTION_TARGET);
}
function getPlayerName(player) {
    var _a, _b;
    const fromParts = `${(_a = player.firstName) !== null && _a !== void 0 ? _a : ''} ${(_b = player.lastName) !== null && _b !== void 0 ? _b : ''}`.trim();
    return player.name || fromParts || player.email || 'Player';
}
function formatBillingCycle(date = new Date()) {
    return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(date);
}
function monthName(month, year) {
    if (!month || !year) {
        return 'Training Fee';
    }
    return `${new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(year, month - 1, 1))} Training Fee`;
}
function getAppBaseUrl(req) {
    const configured = process.env.APP_BASE_URL || process.env.FRONTEND_URL || req.header('origin');
    if (configured) {
        return configured.trim().replace(/\/+$/, '');
    }
    return `${req.protocol}://${req.get('host')}`.replace(/\/+$/, '');
}
function appendQuery(url, query) {
    return `${url}${url.includes('?') ? '&' : '?'}${query}`;
}
function getPaymentsReturnUrl(req) {
    var _a;
    const requested = (_a = req.body) === null || _a === void 0 ? void 0 : _a.returnUrl;
    if (typeof requested === 'string' && requested.trim()) {
        return requested.trim();
    }
    return `${getAppBaseUrl(req)}/payments`;
}
function getRequesterEmail(req) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const header = req.header('authorization') || '';
        const token = (_a = header.match(/^Bearer\s+(.+)$/i)) === null || _a === void 0 ? void 0 : _a[1];
        if (!token) {
            return null;
        }
        const decoded = yield firebaseAdmin_1.admin.auth().verifyIdToken(token);
        return (_b = decoded.email) !== null && _b !== void 0 ? _b : null;
    });
}
function getCurrentPlayer(req) {
    return __awaiter(this, void 0, void 0, function* () {
        const email = yield getRequesterEmail(req);
        if (!email) {
            throw Object.assign(new Error('You must be signed in to load player payments.'), { statusCode: 401 });
        }
        // Only touch Firestore when this environment actually has credentials for
        // it. Firebase Admin is initialised with a projectId alone when no service
        // account is configured (see lib/firebaseAdmin.ts) — that is enough to
        // VERIFY ID tokens (public JWKS, no ADC) but NOT to read Firestore, which
        // needs Application Default Credentials. Without this guard the query below
        // threw "Could not load the default credentials", which is not a not-found,
        // so it was rethrown and surfaced as a 500/503 on GET /finance/player/summary
        // — even though the Postgres fallback right below it had the player all
        // along. Same guard already used at the other Firestore reads in this file.
        if (canUseFirestoreDocuments()) {
            try {
                const snap = yield firebaseAdmin_1.firestore.collection('players').where('email', '==', email).limit(1).get();
                const doc = snap.docs[0];
                if (doc) {
                    return {
                        doc,
                        data: doc.data(),
                    };
                }
            }
            catch (error) {
                // A credential/availability failure must not take the request down
                // when Postgres can answer it. Only genuinely unexpected errors
                // propagate.
                if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                    throw error;
                }
                console.warn('[finance] Firestore player lookup unavailable, falling back to Postgres:', error);
            }
        }
        const playerRows = yield db_1.db
            .select()
            .from(schema_1.players)
            .where((0, drizzle_orm_1.sql) `lower(${schema_1.players.email}) = ${email.trim().toLowerCase()}`)
            .limit(1);
        const player = playerRows[0];
        const userRows = yield db_1.db
            .select()
            .from(schema_1.users)
            .where((0, drizzle_orm_1.sql) `lower(${schema_1.users.email}) = ${email.trim().toLowerCase()}`)
            .limit(1);
        const user = userRows[0];
        if (!player && (user === null || user === void 0 ? void 0 : user.role) === 'player') {
            const inserted = yield db_1.db
                .insert(schema_1.players)
                .values({
                name: user.name,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                status: 'active',
                teamId: null,
            })
                .returning();
            const createdPlayer = inserted[0];
            return {
                data: {
                    id: createdPlayer.id,
                    name: createdPlayer.name,
                    firstName: createdPlayer.firstName,
                    lastName: createdPlayer.lastName,
                    email: createdPlayer.email,
                    teamId: createdPlayer.teamId,
                    clubId: user.clubId,
                },
            };
        }
        if (!player) {
            throw Object.assign(new Error('No player profile was found for this account.'), { statusCode: 404 });
        }
        return {
            data: {
                id: player.id,
                name: player.name,
                firstName: player.firstName,
                lastName: player.lastName,
                email: player.email,
                teamId: player.teamId,
                clubId: user === null || user === void 0 ? void 0 : user.clubId,
            },
        };
    });
}
function getSettingsDocId(clubId) {
    return clubId != null && Number.isFinite(clubId) ? `club:${clubId}` : '1';
}
function normalizeMoneyValue(value) {
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
// Day-of-month (1..31) by which the monthly fee can be paid. Returns null for
// invalid input so callers can reject it; use resolveDueDay() to read a stored
// value with the default fallback.
function normalizeDueDay(value) {
    const day = Math.trunc(Number(value));
    return Number.isFinite(day) && day >= 1 && day <= 31 ? day : null;
}
function resolveDueDay(value) {
    var _a;
    return (_a = normalizeDueDay(value)) !== null && _a !== void 0 ? _a : financeDefaults_1.DEFAULT_PAYMENT_DUE_DAY;
}
function getPlayerClubId(player) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const directClubId = Number(player.clubId);
        if (Number.isFinite(directClubId) && directClubId > 0) {
            return directClubId;
        }
        const teamIds = yield getPlayerTeamIds(player);
        for (const teamId of canUseFirestoreDocuments() ? teamIds : []) {
            try {
                const teamSnap = yield firebaseAdmin_1.firestore.collection('teams').where('id', '==', teamId).limit(1).get();
                const teamDoc = teamSnap.docs[0];
                const clubId = Number((_a = teamDoc === null || teamDoc === void 0 ? void 0 : teamDoc.data()) === null || _a === void 0 ? void 0 : _a.clubId);
                if (Number.isFinite(clubId) && clubId > 0) {
                    return clubId;
                }
            }
            catch (error) {
                if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                    throw error;
                }
            }
        }
        if (teamIds.size) {
            const teamRows = yield db_1.db
                .select({ clubId: schema_1.teams.clubId })
                .from(schema_1.teams)
                .where((0, drizzle_orm_1.inArray)(schema_1.teams.id, Array.from(teamIds)))
                .limit(1);
            const clubId = Number((_b = teamRows[0]) === null || _b === void 0 ? void 0 : _b.clubId);
            if (Number.isFinite(clubId) && clubId > 0) {
                return clubId;
            }
        }
        return null;
    });
}
function seedSettingsData(clubId) {
    // Seeded from neutral defaults only. This used to read club 1's live settings and
    // hand them to whichever club was being onboarded, which meant a new tenant began
    // charging another club's fees — and these numbers feed real Stripe amounts, so
    // the blast radius was money taken from real parents, not a cosmetic default.
    return (0, financeDefaults_1.buildDefaultSettings)(clubId);
}
function ensureSettings(clubId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!canUseFirestoreDocuments()) {
            throw Object.assign(new Error('Firestore settings are not available in this environment.'), { code: 5 });
        }
        const ref = firebaseAdmin_1.firestore.collection('financialSettings').doc(getSettingsDocId(clubId));
        const snap = yield ref.get();
        if (snap.exists) {
            return snap;
        }
        yield ref.set(seedSettingsData(clubId));
        return ref.get();
    });
}
function getSettingsData(clubId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const snap = yield ensureSettings(clubId);
            return snap.data();
        }
        catch (error) {
            if (!isFirestoreNotFound(error)) {
                console.error('[finance/settings] Firestore settings fallback:', error);
            }
        }
        // TODO(schema): `financial_settings` has no `club_id` column, so both this read
        // and the PATCH /settings write overload the primary key as the tenant key. That
        // only holds while club ids and the settings id sequence cannot collide, which
        // nothing enforces. The table needs a real `club_id` column plus a backfill
        // migration; until then, read and write MUST keep using the same key or every
        // club silently reads another club's fees.
        // Both settings inserts pin `id` explicitly, so financial_settings_id_seq never
        // advances and any future insert that omits the id will collide with an existing
        // club's row — the migration adding `club_id` must also setval the sequence past
        // the highest id in use.
        if (clubId == null) {
            // Never fall back to row 1 for a caller we could not scope. These values drive
            // Stripe charges, so handing back some other club's real fees is strictly worse
            // than handing back nothing chargeable.
            console.warn('[finance/settings] No club id resolved for caller; returning safe defaults instead of row 1.');
            return {
                id: financeDefaults_1.DEFAULT_SETTINGS_ROW_ID,
                clubId: null,
                monthlyPlayerFee: 0,
                trainingLevy: 0,
                facilityFee: 0,
                autoAdjust: 1,
                paymentDueDay: financeDefaults_1.DEFAULT_PAYMENT_DUE_DAY,
                updatedAt: new Date(),
            };
        }
        const rows = yield db_1.db
            .select()
            .from(schema_1.financialSettings)
            .where((0, drizzle_orm_1.eq)(schema_1.financialSettings.id, clubId))
            .limit(1);
        const existing = rows[0];
        if (existing) {
            return {
                id: existing.id,
                clubId: clubId !== null && clubId !== void 0 ? clubId : null,
                monthlyPlayerFee: existing.monthlyPlayerFee,
                trainingLevy: existing.trainingLevy,
                facilityFee: existing.facilityFee,
                autoAdjust: existing.autoAdjust,
                paymentDueDay: resolveDueDay(existing.paymentDueDay),
                updatedAt: existing.updatedAt,
            };
        }
        // The id has to be pinned to the club, not left to the serial default: the read
        // above looks the row up by club id, so an auto-assigned id would never be found
        // again and every request would insert another orphan row.
        const inserted = yield db_1.db
            .insert(schema_1.financialSettings)
            .values({
            id: clubId,
            monthlyPlayerFee: 0,
            trainingLevy: 0,
            facilityFee: 0,
            autoAdjust: 1,
            updatedAt: new Date().toISOString(),
        })
            .returning();
        return {
            id: inserted[0].id,
            clubId: clubId !== null && clubId !== void 0 ? clubId : null,
            monthlyPlayerFee: inserted[0].monthlyPlayerFee,
            trainingLevy: inserted[0].trainingLevy,
            facilityFee: inserted[0].facilityFee,
            autoAdjust: inserted[0].autoAdjust,
            paymentDueDay: resolveDueDay(inserted[0].paymentDueDay),
            updatedAt: inserted[0].updatedAt,
        };
    });
}
function getPlayerSettingsData(player) {
    return __awaiter(this, void 0, void 0, function* () {
        return getSettingsData(yield getPlayerClubId(player));
    });
}
function resolveAdminFinanceClubId(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const user = yield (0, requestContext_1.requireRequestUser)(req, res);
        if (!user) {
            return null;
        }
        const role = (0, requestAuth_1.normalizeRole)(user.role);
        if (!['admin', 'superadmin', 'accountant'].includes(role)) {
            res.status(403).json({ error: 'Admin finance access is required.' });
            return null;
        }
        if (user.clubId != null) {
            return Number(user.clubId);
        }
        if (role === 'superadmin') {
            const requestedClubId = Number(((_b = (_a = req.query) === null || _a === void 0 ? void 0 : _a.clubId) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.clubId));
            return Number.isFinite(requestedClubId) && requestedClubId > 0 ? requestedClubId : null;
        }
        res.status(403).json({ error: 'Your account is not assigned to a club.' });
        return null;
    });
}
function getPlayerTeamIds(player) {
    return __awaiter(this, void 0, void 0, function* () {
        const ids = new Set();
        if (player.teamId != null) {
            ids.add(Number(player.teamId));
        }
        const addMembershipsFromPostgres = () => __awaiter(this, void 0, void 0, function* () {
            const membershipRows = yield db_1.db
                .select({ teamId: schema_1.playersToTeams.teamId })
                .from(schema_1.playersToTeams)
                .where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, player.id));
            membershipRows.forEach((row) => {
                const teamId = Number(row.teamId);
                if (Number.isFinite(teamId)) {
                    ids.add(teamId);
                }
            });
        });
        // No Firestore credentials in this environment — go straight to Postgres
        // rather than paying an ADC timeout to discover the same thing.
        if (!canUseFirestoreDocuments()) {
            yield addMembershipsFromPostgres();
            return ids;
        }
        try {
            const membershipsSnap = yield firebaseAdmin_1.firestore.collection('playersToTeams').where('playerId', '==', player.id).get();
            membershipsSnap.docs.forEach((docSnap) => {
                const teamId = Number(docSnap.data().teamId);
                if (Number.isFinite(teamId)) {
                    ids.add(teamId);
                }
            });
        }
        catch (error) {
            if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                throw error;
            }
            yield addMembershipsFromPostgres();
        }
        return ids;
    });
}
function getPlayerPaymentRows(playerId) {
    return __awaiter(this, void 0, void 0, function* () {
        // Skip Firestore outright when this environment has no credentials for it:
        // attempting the call costs a ~30s Application-Default-Credentials timeout
        // per read before failing, which is what made this endpoint hang.
        if (canUseFirestoreDocuments()) {
            try {
                const snap = yield firebaseAdmin_1.firestore.collection('playerPayments').where('playerId', '==', playerId).get();
                return snap.docs.map((docSnap) => ({
                    ref: docSnap.ref,
                    data: docSnap.data(),
                }));
            }
            catch (error) {
                if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                    throw error;
                }
            }
        }
        const rows = yield db_1.db
            .select()
            .from(schema_1.playerPayments)
            .where((0, drizzle_orm_1.eq)(schema_1.playerPayments.playerId, playerId));
        return rows.map((row) => ({
            data: {
                id: row.id,
                playerId: row.playerId,
                amount: row.amount,
                month: row.month,
                year: row.year,
                status: row.status,
                date: row.date,
                createdAt: row.createdAt,
            },
        }));
    });
}
function getPlayerByNumericId(playerId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (canUseFirestoreDocuments()) {
            try {
                const snap = yield firebaseAdmin_1.firestore.collection('players').where('id', '==', playerId).limit(1).get();
                const doc = snap.docs[0];
                if (doc) {
                    return doc.data();
                }
            }
            catch (error) {
                if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                    throw error;
                }
            }
        }
        const rows = yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.eq)(schema_1.players.id, playerId)).limit(1);
        const player = rows[0];
        return player
            ? {
                id: player.id,
                name: player.name,
                firstName: player.firstName,
                lastName: player.lastName,
                email: player.email,
                teamId: player.teamId,
            }
            : null;
    });
}
function getPaidFeeIds(paymentRows) {
    const paidFeeIds = new Set();
    paymentRows
        .filter(({ data }) => isPaidStatus(data.status))
        .forEach(({ data }) => {
        var _a;
        const rawFeeIds = Array.isArray(data.feeIds)
            ? data.feeIds
            : String((_a = data.feeIds) !== null && _a !== void 0 ? _a : '').split(',');
        rawFeeIds
            .map((feeId) => String(feeId).trim())
            .filter(Boolean)
            .forEach((feeId) => paidFeeIds.add(feeId));
    });
    return paidFeeIds;
}
function buildEventFees(player, currency, paidFeeIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const teamIds = yield getPlayerTeamIds(player);
        if (!teamIds.size) {
            return [];
        }
        const now = new Date();
        const eventRowsFromPostgres = () => __awaiter(this, void 0, void 0, function* () {
            return yield db_1.db
                .select()
                .from(schema_1.events)
                .where((0, drizzle_orm_1.inArray)(schema_1.events.teamId, Array.from(teamIds)));
        });
        let eventRows;
        if (!canUseFirestoreDocuments()) {
            eventRows = yield eventRowsFromPostgres();
        }
        else {
            try {
                const eventsSnap = yield firebaseAdmin_1.firestore.collection('events').get();
                eventRows = eventsSnap.docs.map((docSnap) => docSnap.data());
            }
            catch (error) {
                if (!isFirestoreNotFound(error) && !isFirestoreUnavailable(error)) {
                    throw error;
                }
                eventRows = yield eventRowsFromPostgres();
            }
        }
        return eventRows
            .filter((event) => {
            const amount = asPositiveAmount(event.amount);
            const startsAt = (0, firebaseAdmin_1.toDate)(event.startTime);
            const teamId = Number(event.teamId);
            const feeId = `event:${event.id}`;
            return amount > 0
                && !paidFeeIds.has(feeId)
                && Number.isFinite(teamId)
                && teamIds.has(teamId)
                && startsAt
                && startsAt >= now
                && normalizeStatus(event.status) !== 'cancelled';
        })
            .sort((a, b) => { var _a, _b, _c, _d; return ((_b = (_a = (0, firebaseAdmin_1.toDate)(a.startTime)) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = (0, firebaseAdmin_1.toDate)(b.startTime)) === null || _c === void 0 ? void 0 : _c.getTime()) !== null && _d !== void 0 ? _d : 0); })
            .slice(0, 6)
            .map((event) => {
            var _a;
            return ({
                id: `event:${event.id}`,
                label: event.title || 'Team Event Fee',
                description: event.description || 'Team event registration fee',
                amount: asPositiveAmount(event.amount),
                currency,
                status: 'upcoming',
                dueDate: (_a = (0, firebaseAdmin_1.toIso)(event.startTime)) !== null && _a !== void 0 ? _a : null,
                icon: event.type === 'match' ? 'trophy' : 'receipt',
            });
        });
    });
}
function buildPlayerFees(player, paymentRows, currency) {
    return __awaiter(this, void 0, void 0, function* () {
        const settings = yield getPlayerSettingsData(player);
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const paidFeeIds = getPaidFeeIds(paymentRows);
        const fees = paymentRows
            .filter(({ data }) => !isPaidStatus(data.status))
            .map(({ data }) => {
            var _a, _b, _c, _d, _e, _f;
            const amount = asPositiveAmount(data.amount);
            const status = isFailedStatus(data.status) ? 'failed' : 'pending';
            return {
                id: `payment:${(_a = data.id) !== null && _a !== void 0 ? _a : `${(_b = data.month) !== null && _b !== void 0 ? _b : currentMonth}-${(_c = data.year) !== null && _c !== void 0 ? _c : currentYear}`}`,
                label: data.description || monthName(data.month, data.year),
                description: data.description ? 'Club payment request' : 'Recurring monthly coaching fee',
                amount,
                currency: data.currency || currency,
                status,
                dueDate: (_e = (0, firebaseAdmin_1.toIso)((_d = data.date) !== null && _d !== void 0 ? _d : data.createdAt)) !== null && _e !== void 0 ? _e : null,
                icon: 'training',
                paymentId: (_f = data.id) !== null && _f !== void 0 ? _f : null,
            };
        })
            .filter((fee) => fee.amount > 0);
        const hasCurrentMonthlyFee = paymentRows.some(({ data }) => (Number(data.month) === currentMonth &&
            Number(data.year) === currentYear));
        if (!hasCurrentMonthlyFee) {
            const monthlyFeeId = `monthly:${currentYear}-${String(currentMonth).padStart(2, '0')}`;
            const monthlyPlayerFee = asPositiveAmount(settings.monthlyPlayerFee);
            if (monthlyPlayerFee > 0 && !paidFeeIds.has(monthlyFeeId)) {
                fees.push({
                    id: monthlyFeeId,
                    label: monthName(currentMonth, currentYear),
                    description: 'Recurring monthly coaching fee',
                    amount: monthlyPlayerFee,
                    currency,
                    status: 'upcoming',
                    // The monthly fee can be paid until the configured due day of the
                    // following month (e.g. due day 25 → July's fee is due Aug 25).
                    dueDate: new Date(currentYear, currentMonth, resolveDueDay(settings.paymentDueDay)).toISOString(),
                    icon: 'training',
                });
            }
        }
        const trainingLevy = asPositiveAmount(settings.trainingLevy);
        const trainingLevyId = `levy:${currentYear}-${String(currentMonth).padStart(2, '0')}`;
        if (trainingLevy > 0 && !paidFeeIds.has(trainingLevyId)) {
            fees.push({
                id: trainingLevyId,
                label: 'Training Levy',
                description: 'Club training and development levy',
                amount: trainingLevy,
                currency,
                status: 'upcoming',
                dueDate: new Date(currentYear, currentMonth - 1, 28).toISOString(),
                icon: 'receipt',
            });
        }
        const facilityFee = asPositiveAmount(settings.facilityFee);
        const facilityFeeId = `facility:${currentYear}-${String(currentMonth).padStart(2, '0')}`;
        if (facilityFee > 0 && !paidFeeIds.has(facilityFeeId)) {
            fees.push({
                id: facilityFeeId,
                label: 'Facility Fee',
                description: 'Court and facility contribution',
                amount: facilityFee,
                currency,
                status: 'upcoming',
                dueDate: new Date(currentYear, currentMonth - 1, 28).toISOString(),
                icon: 'receipt',
            });
        }
        return [...fees, ...(yield buildEventFees(player, currency, paidFeeIds))];
    });
}
function buildTransactions(paymentRows, currency) {
    return paymentRows
        .filter(({ data }) => isPaidStatus(data.status) || isFailedStatus(data.status))
        .sort((a, b) => { var _a, _b, _c, _d, _e, _f; return ((_c = (_b = (0, firebaseAdmin_1.toDate)((_a = b.data.date) !== null && _a !== void 0 ? _a : b.data.createdAt)) === null || _b === void 0 ? void 0 : _b.getTime()) !== null && _c !== void 0 ? _c : 0) - ((_f = (_e = (0, firebaseAdmin_1.toDate)((_d = a.data.date) !== null && _d !== void 0 ? _d : a.data.createdAt)) === null || _e === void 0 ? void 0 : _e.getTime()) !== null && _f !== void 0 ? _f : 0); })
        .slice(0, 12)
        .map(({ data }) => {
        var _a, _b, _c, _d, _e;
        return ({
            id: String((_b = (_a = data.id) !== null && _a !== void 0 ? _a : data.stripeCheckoutSessionId) !== null && _b !== void 0 ? _b : `${data.month}-${data.year}`),
            label: data.description || monthName(data.month, data.year),
            description: data.stripeCheckoutSessionId ? 'Stripe Checkout payment' : 'Club payment record',
            amount: asPositiveAmount(data.amount),
            currency: data.currency || currency,
            status: isPaidStatus(data.status) ? 'success' : 'error',
            date: (_d = (0, firebaseAdmin_1.toIso)((_c = data.date) !== null && _c !== void 0 ? _c : data.createdAt)) !== null && _d !== void 0 ? _d : new Date().toISOString(),
            receiptUrl: (_e = data.receiptUrl) !== null && _e !== void 0 ? _e : null,
        });
    });
}
function buildAdminRecentPayments(clubId_1) {
    return __awaiter(this, arguments, void 0, function* (clubId, limit = 12, teamId = null) {
        const allTeamRows = clubId == null
            ? yield db_1.db.select({ id: schema_1.teams.id, name: schema_1.teams.name }).from(schema_1.teams)
            : yield db_1.db.select({ id: schema_1.teams.id, name: schema_1.teams.name }).from(schema_1.teams).where((0, drizzle_orm_1.eq)(schema_1.teams.clubId, clubId));
        // When scoped to a single team, restrict every downstream lookup to it so the
        // report only contains that team's players' payments.
        const teamRows = teamId != null ? allTeamRows.filter((team) => team.id === teamId) : allTeamRows;
        const teamNameById = new Map(teamRows.map((team) => [team.id, team.name]));
        const teamIds = teamRows.map((team) => team.id);
        const directPlayers = clubId == null && teamId == null
            ? yield db_1.db.select().from(schema_1.players)
            : teamIds.length
                ? yield db_1.db.select().from(schema_1.players).where((0, drizzle_orm_1.inArray)(schema_1.players.teamId, teamIds))
                : [];
        const relationRows = teamIds.length
            ? yield db_1.db
                .select({ player: schema_1.players, teamId: schema_1.playersToTeams.teamId })
                .from(schema_1.playersToTeams)
                .innerJoin(schema_1.players, (0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, schema_1.players.id))
                .where((0, drizzle_orm_1.inArray)(schema_1.playersToTeams.teamId, teamIds))
            : [];
        // Club-wide fallback players (users without an explicit team) don't belong to
        // a single team, so skip them entirely when the report is team-scoped.
        const clubUserRows = clubId == null || teamId != null
            ? []
            : yield db_1.db
                .select({ email: schema_1.users.email })
                .from(schema_1.users)
                .where((0, drizzle_orm_1.eq)(schema_1.users.clubId, clubId));
        const clubUserEmails = clubUserRows.map((user) => user.email.trim().toLowerCase());
        const unassignedClubPlayers = clubUserEmails.length
            ? yield db_1.db
                .select()
                .from(schema_1.players)
                .where((0, drizzle_orm_1.inArray)(schema_1.players.email, clubUserEmails))
            : [];
        const playersById = new Map();
        const playerTeamNameById = new Map();
        directPlayers.forEach((player) => {
            var _a;
            playersById.set(player.id, player);
            playerTeamNameById.set(player.id, player.teamId != null ? (_a = teamNameById.get(player.teamId)) !== null && _a !== void 0 ? _a : null : null);
        });
        relationRows.forEach((row) => {
            var _a;
            playersById.set(row.player.id, row.player);
            if (!playerTeamNameById.has(row.player.id)) {
                playerTeamNameById.set(row.player.id, (_a = teamNameById.get(row.teamId)) !== null && _a !== void 0 ? _a : null);
            }
        });
        unassignedClubPlayers.forEach((player) => {
            var _a;
            if (!playersById.has(player.id)) {
                playersById.set(player.id, player);
                playerTeamNameById.set(player.id, player.teamId != null ? (_a = teamNameById.get(player.teamId)) !== null && _a !== void 0 ? _a : null : null);
            }
        });
        const playerIds = Array.from(playersById.keys());
        if (!playerIds.length) {
            return [];
        }
        const postgresPaymentRows = yield db_1.db
            .select()
            .from(schema_1.playerPayments)
            .where((0, drizzle_orm_1.inArray)(schema_1.playerPayments.playerId, playerIds));
        const payments = postgresPaymentRows
            .map((payment) => {
            var _a, _b, _c, _d;
            const player = playersById.get(payment.playerId);
            const paymentDate = (_b = (_a = (0, firebaseAdmin_1.toIso)(payment.date)) !== null && _a !== void 0 ? _a : (0, firebaseAdmin_1.toIso)(payment.createdAt)) !== null && _b !== void 0 ? _b : new Date().toISOString();
            return {
                id: String(payment.id),
                playerId: payment.playerId,
                playerName: player ? getPlayerName(player) : `Player #${payment.playerId}`,
                playerEmail: (_c = player === null || player === void 0 ? void 0 : player.email) !== null && _c !== void 0 ? _c : null,
                teamName: (_d = playerTeamNameById.get(payment.playerId)) !== null && _d !== void 0 ? _d : null,
                amount: asPositiveAmount(payment.amount),
                currency: DEFAULT_PAYMENT_CURRENCY,
                status: payment.status,
                date: paymentDate,
                description: monthName(payment.month, payment.year),
                provider: null,
                receiptUrl: null,
            };
        });
        if (canUseFirestoreDocuments()) {
            try {
                const firestorePayments = [];
                for (const playerIdChunk of chunkArray(playerIds, 30)) {
                    const snap = yield firebaseAdmin_1.firestore
                        .collection('playerPayments')
                        .where('playerId', 'in', playerIdChunk)
                        .get();
                    snap.docs.forEach((docSnap) => {
                        var _a;
                        firestorePayments.push(Object.assign(Object.assign({}, docSnap.data()), { id: (_a = docSnap.data().id) !== null && _a !== void 0 ? _a : docSnap.id }));
                    });
                }
                firestorePayments.forEach((payment) => {
                    var _a, _b, _c, _d, _e, _f, _g;
                    const playerId = Number(payment.playerId);
                    const player = playersById.get(playerId);
                    if (!player) {
                        return;
                    }
                    const paymentDate = (_b = (_a = (0, firebaseAdmin_1.toIso)(payment.date)) !== null && _a !== void 0 ? _a : (0, firebaseAdmin_1.toIso)(payment.createdAt)) !== null && _b !== void 0 ? _b : new Date().toISOString();
                    payments.push({
                        id: String((_d = (_c = payment.id) !== null && _c !== void 0 ? _c : payment.stripeCheckoutSessionId) !== null && _d !== void 0 ? _d : `${payment.playerId}-${paymentDate}`),
                        playerId,
                        playerName: getPlayerName(player),
                        playerEmail: (_e = player.email) !== null && _e !== void 0 ? _e : null,
                        teamName: (_f = playerTeamNameById.get(playerId)) !== null && _f !== void 0 ? _f : null,
                        amount: asPositiveAmount(payment.amount),
                        currency: payment.currency || DEFAULT_PAYMENT_CURRENCY,
                        status: payment.status || 'paid',
                        date: paymentDate,
                        description: payment.description || monthName(payment.month, payment.year),
                        provider: payment.stripeCheckoutSessionId ? 'stripe' : null,
                        receiptUrl: (_g = payment.receiptUrl) !== null && _g !== void 0 ? _g : null,
                    });
                });
            }
            catch (error) {
                if (!isFirestoreNotFound(error)) {
                    console.error('[GET /api/finance/admin/recent-payments] Firestore payments fallback:', error);
                }
            }
        }
        const seenPayments = new Set();
        return payments
            .filter((payment) => {
            var _a;
            const dedupeKey = [
                (_a = payment.provider) !== null && _a !== void 0 ? _a : 'manual',
                payment.id,
                payment.playerId,
                payment.date,
                payment.amount,
            ].join(':');
            if (seenPayments.has(dedupeKey)) {
                return false;
            }
            seenPayments.add(dedupeKey);
            return true;
        })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, limit);
    });
}
function buildDueLabel(fees) {
    if (!fees.length) {
        return 'Settled';
    }
    const dueTimes = fees
        .map((fee) => { var _a, _b; return (_b = (_a = (0, firebaseAdmin_1.toDate)(fee.dueDate)) === null || _a === void 0 ? void 0 : _a.getTime()) !== null && _b !== void 0 ? _b : null; })
        .filter((value) => value != null)
        .sort((a, b) => a - b);
    if (!dueTimes.length) {
        return 'Due this cycle';
    }
    const diffDays = Math.ceil((dueTimes[0] - Date.now()) / 86400000);
    if (diffDays <= 0) {
        return 'Due now';
    }
    return diffDays === 1 ? 'Due in 1 day' : `Due in ${diffDays} days`;
}
function listPlayerPaymentMethods(player) {
    return __awaiter(this, void 0, void 0, function* () {
        const stripe = getStripeIfConfigured();
        if (!stripe || !player.stripeCustomerId) {
            return [];
        }
        try {
            const methods = yield stripe.paymentMethods.list({
                customer: player.stripeCustomerId,
                type: 'card',
                limit: 5,
            });
            return methods.data.map((method, index) => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                return ({
                    id: method.id,
                    brand: (_b = (_a = method.card) === null || _a === void 0 ? void 0 : _a.brand) !== null && _b !== void 0 ? _b : 'card',
                    last4: (_d = (_c = method.card) === null || _c === void 0 ? void 0 : _c.last4) !== null && _d !== void 0 ? _d : '----',
                    expMonth: (_f = (_e = method.card) === null || _e === void 0 ? void 0 : _e.exp_month) !== null && _f !== void 0 ? _f : null,
                    expYear: (_h = (_g = method.card) === null || _g === void 0 ? void 0 : _g.exp_year) !== null && _h !== void 0 ? _h : null,
                    isDefault: index === 0,
                });
            });
        }
        catch (error) {
            console.error('[GET /api/finance/player/summary] Stripe payment methods error:', error);
            return [];
        }
    });
}
function ensureStripeCustomer(player) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (player.data.stripeCustomerId) {
            return player.data.stripeCustomerId;
        }
        const stripe = getStripe();
        const customer = yield stripe.customers.create({
            email: (_a = player.data.email) !== null && _a !== void 0 ? _a : undefined,
            name: getPlayerName(player.data),
            metadata: {
                playerId: String(player.data.id),
            },
        });
        if (player.doc) {
            yield player.doc.ref.set({ stripeCustomerId: customer.id }, { merge: true });
        }
        player.data.stripeCustomerId = customer.id;
        return customer.id;
    });
}
function selectedFeesFromBody(allFees, feeIds) {
    const requestedIds = Array.isArray(feeIds)
        ? feeIds.map((id) => String(id))
        : [];
    if (!requestedIds.length) {
        return allFees;
    }
    const requested = new Set(requestedIds);
    return allFees.filter((fee) => requested.has(fee.id));
}
function markPaymentRowsPaid(params) {
    return __awaiter(this, void 0, void 0, function* () {
        let usePostgresPayments = false;
        try {
            const existingSessionSnap = yield firebaseAdmin_1.firestore
                .collection('playerPayments')
                .where('stripeCheckoutSessionId', '==', params.checkoutSessionId)
                .limit(1)
                .get();
            if (!existingSessionSnap.empty) {
                return existingSessionSnap.docs[0].data();
            }
        }
        catch (error) {
            if (!isFirestoreNotFound(error)) {
                throw error;
            }
            usePostgresPayments = true;
        }
        let updatedExistingRows = 0;
        if (!usePostgresPayments) {
            for (const fee of params.fees) {
                if (!String(fee.id).startsWith('payment:') || fee.paymentId == null) {
                    continue;
                }
                const paymentId = Number(fee.paymentId);
                if (!Number.isFinite(paymentId)) {
                    continue;
                }
                const paymentSnap = yield firebaseAdmin_1.firestore.collection('playerPayments').where('id', '==', paymentId).limit(1).get();
                const paymentDoc = paymentSnap.docs[0];
                if (!paymentDoc) {
                    continue;
                }
                yield paymentDoc.ref.set({
                    status: 'paid',
                    date: new Date(),
                    provider: 'stripe',
                    currency: params.currency,
                    stripeCheckoutSessionId: params.checkoutSessionId,
                    stripePaymentIntentId: params.paymentIntentId,
                    receiptUrl: params.receiptUrl,
                    feeIds: params.fees.map((fee) => fee.id),
                }, { merge: true });
                updatedExistingRows += 1;
            }
        }
        if (updatedExistingRows === params.fees.length) {
            return { updated: updatedExistingRows };
        }
        const now = new Date();
        if (usePostgresPayments) {
            const inserted = yield db_1.db
                .insert(schema_1.playerPayments)
                .values({
                playerId: params.playerId,
                amount: Math.round(params.amount),
                month: now.getMonth() + 1,
                year: now.getFullYear(),
                status: 'paid',
                date: now.toISOString(),
                createdAt: now.toISOString(),
            })
                .returning();
            return inserted[0];
        }
        const id = yield (0, firebaseAdmin_1.nextNumericId)('playerPayments');
        const record = {
            id,
            playerId: params.playerId,
            amount: params.amount,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            status: 'paid',
            date: now,
            createdAt: now,
            description: params.label,
            provider: 'stripe',
            currency: params.currency,
            stripeCheckoutSessionId: params.checkoutSessionId,
            stripePaymentIntentId: params.paymentIntentId,
            receiptUrl: params.receiptUrl,
            feeIds: params.fees.map((fee) => fee.id),
        };
        yield firebaseAdmin_1.firestore.collection('playerPayments').doc(String(id)).set(record);
        return record;
    });
}
function markCheckoutSessionFailed(sessionId, reason) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const stripe = getStripe();
        const session = yield stripe.checkout.sessions.retrieve(sessionId);
        if (session.mode !== 'payment') {
            return {
                recorded: false,
                reason: 'checkout_session_not_payment_mode',
            };
        }
        let usePostgresPayments = false;
        try {
            const existingSessionSnap = yield firebaseAdmin_1.firestore
                .collection('playerPayments')
                .where('stripeCheckoutSessionId', '==', session.id)
                .limit(1)
                .get();
            if (!existingSessionSnap.empty) {
                const existingDoc = existingSessionSnap.docs[0];
                yield existingDoc.ref.set({
                    status: 'failed',
                    failureReason: reason,
                    updatedAt: new Date(),
                }, { merge: true });
                return {
                    recorded: true,
                    payment: existingDoc.data(),
                };
            }
        }
        catch (error) {
            if (!isFirestoreNotFound(error)) {
                throw error;
            }
            usePostgresPayments = true;
        }
        const playerId = Number((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.playerId);
        if (!Number.isFinite(playerId)) {
            throw new Error(`Stripe session ${session.id} is missing playerId metadata.`);
        }
        const currency = (session.currency || DEFAULT_PAYMENT_CURRENCY).toLowerCase();
        const amount = fromMinorUnits(session.amount_total, currency);
        const now = new Date();
        if (usePostgresPayments) {
            const inserted = yield db_1.db
                .insert(schema_1.playerPayments)
                .values({
                playerId,
                amount: Math.round(amount),
                month: now.getMonth() + 1,
                year: now.getFullYear(),
                status: 'failed',
                date: now.toISOString(),
                createdAt: now.toISOString(),
            })
                .returning();
            return {
                recorded: true,
                payment: inserted[0],
            };
        }
        const id = yield (0, firebaseAdmin_1.nextNumericId)('playerPayments');
        const record = {
            id,
            playerId,
            amount,
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            status: 'failed',
            failureReason: reason,
            date: now,
            createdAt: now,
            description: ((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.label) || (reason === 'expired' ? 'Expired Stripe checkout' : 'Failed Stripe checkout'),
            provider: 'stripe',
            currency,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
            receiptUrl: null,
            feeIds: String((_d = (_c = session.metadata) === null || _c === void 0 ? void 0 : _c.feeIds) !== null && _d !== void 0 ? _d : '')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean),
        };
        yield firebaseAdmin_1.firestore.collection('playerPayments').doc(String(id)).set(record);
        return {
            recorded: true,
            payment: record,
        };
    });
}
function fulfillPaidCheckoutSession(sessionId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const stripe = getStripe();
        const session = yield stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['payment_intent.latest_charge'],
        });
        if (session.mode !== 'payment' || session.payment_status !== 'paid') {
            return {
                fulfilled: false,
                reason: 'checkout_session_not_paid',
            };
        }
        const playerId = Number((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.playerId);
        if (!Number.isFinite(playerId)) {
            throw new Error(`Stripe session ${session.id} is missing playerId metadata.`);
        }
        const player = yield getPlayerByNumericId(playerId);
        if (!player) {
            throw new Error(`Player ${playerId} from Stripe session ${session.id} was not found.`);
        }
        const currency = (session.currency || DEFAULT_PAYMENT_CURRENCY).toLowerCase();
        const paymentIntent = session.payment_intent;
        const latestCharge = paymentIntent && typeof paymentIntent.latest_charge !== 'string'
            ? paymentIntent.latest_charge
            : null;
        const amount = fromMinorUnits(session.amount_total, currency);
        const feeIds = String((_c = (_b = session.metadata) === null || _b === void 0 ? void 0 : _b.feeIds) !== null && _c !== void 0 ? _c : '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
        const paymentRows = yield getPlayerPaymentRows(player.id);
        const allFees = yield buildPlayerFees(player, paymentRows, currency);
        const paidFees = selectedFeesFromBody(allFees, feeIds);
        const record = yield markPaymentRowsPaid({
            playerId: player.id,
            fees: paidFees.length ? paidFees : allFees,
            amount,
            currency,
            label: ((_d = session.metadata) === null || _d === void 0 ? void 0 : _d.label) || 'Stripe payment',
            checkoutSessionId: session.id,
            paymentIntentId: (_e = paymentIntent === null || paymentIntent === void 0 ? void 0 : paymentIntent.id) !== null && _e !== void 0 ? _e : null,
            receiptUrl: (_f = latestCharge === null || latestCharge === void 0 ? void 0 : latestCharge.receipt_url) !== null && _f !== void 0 ? _f : null,
        });
        return {
            fulfilled: true,
            payment: record,
        };
    });
}
function handleRouteError(res, error, fallback) {
    const statusCode = typeof error === 'object' && error && 'statusCode' in error
        ? Number(error.statusCode)
        : 500;
    console.error(fallback, error);
    res.status(Number.isFinite(statusCode) ? statusCode : 500).json({
        error: error instanceof Error ? error.message : fallback,
    });
}
function stripeWebhookHandler(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const webhookSecret = (_a = process.env.STRIPE_WEBHOOK_SECRET) === null || _a === void 0 ? void 0 : _a.trim();
        if (!webhookSecret) {
            res.status(500).json({ error: 'Stripe webhook secret is not configured.' });
            return;
        }
        const signature = req.header('stripe-signature');
        if (!signature) {
            res.status(400).json({ error: 'Missing Stripe-Signature header.' });
            return;
        }
        let event;
        try {
            event = getStripe().webhooks.constructEvent(req.body, signature, webhookSecret);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Invalid Stripe webhook signature.';
            console.error('[POST /api/finance/stripe/webhook] signature error:', message);
            res.status(400).send(`Webhook Error: ${message}`);
            return;
        }
        try {
            switch (event.type) {
                case 'checkout.session.completed':
                case 'checkout.session.async_payment_succeeded': {
                    const session = event.data.object;
                    if (session.id) {
                        yield fulfillPaidCheckoutSession(session.id);
                    }
                    break;
                }
                case 'checkout.session.async_payment_failed': {
                    const session = event.data.object;
                    if (session.id) {
                        yield markCheckoutSessionFailed(session.id, 'failed');
                    }
                    break;
                }
                case 'checkout.session.expired': {
                    const session = event.data.object;
                    if (session.id) {
                        yield markCheckoutSessionFailed(session.id, 'expired');
                    }
                    break;
                }
                default:
                    break;
            }
            res.json({ received: true });
        }
        catch (error) {
            console.error('[POST /api/finance/stripe/webhook] fulfillment error:', error);
            res.status(500).json({ error: 'Stripe webhook fulfillment failed.' });
        }
    });
}
const uploadDir = path_1.default.join(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname).toLowerCase());
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: FINANCE_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
        const extension = path_1.default.extname(file.originalname).toLowerCase();
        if (!ALLOWED_FINANCE_UPLOAD_MIME_TYPES.has(file.mimetype) || !ALLOWED_FINANCE_UPLOAD_EXTENSIONS.has(extension)) {
            cb(new Error('Only PDF, JPG, PNG or WebP files up to 10MB are allowed.'));
            return;
        }
        cb(null, true);
    },
});
router.get('/documents', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const clubId = yield resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }
        try {
            let query = firebaseAdmin_1.firestore.collection('financialDocuments');
            if (clubId !== null) {
                query = query.where('clubId', '==', clubId);
            }
            const snap = yield query.orderBy('date', 'desc').get();
            const docs = snap.docs.map((docSnap) => {
                var _a;
                const data = docSnap.data();
                return Object.assign(Object.assign({}, data), { date: (_a = (0, firebaseAdmin_1.toIso)(data.date)) !== null && _a !== void 0 ? _a : new Date().toISOString() });
            });
            res.json(docs);
        }
        catch (firestoreError) {
            console.error('[GET /api/finance/documents] Firestore fallback:', firestoreError);
            const docs = clubId !== null
                ? yield db_1.db.select().from(schema_1.financialDocuments).where((0, drizzle_orm_1.eq)(schema_1.financialDocuments.clubId, clubId)).orderBy((0, drizzle_orm_1.desc)(schema_1.financialDocuments.date))
                : yield db_1.db.select().from(schema_1.financialDocuments).orderBy((0, drizzle_orm_1.desc)(schema_1.financialDocuments.date));
            res.json(docs.map((doc) => {
                var _a;
                return (Object.assign(Object.assign({}, doc), { date: (_a = (0, firebaseAdmin_1.toIso)(doc.date)) !== null && _a !== void 0 ? _a : new Date().toISOString() }));
            }));
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
}));
router.patch('/documents/:id/status', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const clubId = yield resolveAdminFinanceClubId(req, res);
    if (clubId === null && res.headersSent) {
        return;
    }
    const id = Number(req.params.id);
    const { status } = req.body;
    if (!status || !['pending', 'processed', 'rejected'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
    }
    try {
        try {
            const snap = yield firebaseAdmin_1.firestore.collection('financialDocuments').where('id', '==', id).limit(1).get();
            const docSnap = snap.docs[0];
            if (!docSnap) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }
            const existing = docSnap.data();
            if (clubId !== null && existing.clubId != null && Number(existing.clubId) !== clubId) {
                res.status(403).json({ error: 'This document belongs to a different club.' });
                return;
            }
            yield docSnap.ref.set({ status }, { merge: true });
            const updated = yield docSnap.ref.get();
            res.json(Object.assign(Object.assign({}, updated.data()), { date: (_a = (0, firebaseAdmin_1.toIso)(updated.data().date)) !== null && _a !== void 0 ? _a : null }));
            yield recordFinanceAudit(Object.assign({ action: 'finance.document.status', entityType: 'financial_document', entityId: id, clubId, metadata: { store: 'firestore', previousStatus: (_b = existing.status) !== null && _b !== void 0 ? _b : null, nextStatus: status } }, financeAuditActor(req)));
        }
        catch (firestoreError) {
            console.error('[PATCH /api/finance/documents/:id/status] Firestore fallback:', firestoreError);
            const existingRows = yield db_1.db.select().from(schema_1.financialDocuments).where((0, drizzle_orm_1.eq)(schema_1.financialDocuments.id, id)).limit(1);
            const existing = existingRows[0];
            if (!existing) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }
            if (clubId !== null && existing.clubId != null && Number(existing.clubId) !== clubId) {
                res.status(403).json({ error: 'This document belongs to a different club.' });
                return;
            }
            const updatedRows = yield db_1.db
                .update(schema_1.financialDocuments)
                .set({ status: status })
                .where((0, drizzle_orm_1.eq)(schema_1.financialDocuments.id, id))
                .returning();
            const updated = updatedRows[0];
            if (!updated) {
                res.status(404).json({ error: 'Document not found' });
                return;
            }
            res.json(Object.assign(Object.assign({}, updated), { date: (_c = (0, firebaseAdmin_1.toIso)(updated.date)) !== null && _c !== void 0 ? _c : null }));
            yield recordFinanceAudit(Object.assign({ action: 'finance.document.status', entityType: 'financial_document', entityId: id, clubId, metadata: { store: 'postgres', previousStatus: (_d = existing.status) !== null && _d !== void 0 ? _d : null, nextStatus: status } }, financeAuditActor(req)));
        }
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update document status' });
    }
}));
router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, (error) => {
        if (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid document upload.' });
        }
        next();
    });
}, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const clubId = yield resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            if (req.file) {
                fs_1.default.unlink(req.file.path, () => { });
            }
            return;
        }
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }
        const { type, amount, description } = req.body;
        const parsedAmount = normalizeMoneyValue(amount);
        const documentUrl = `/uploads/${req.file.filename}`;
        const record = {
            type: type || 'expense',
            amount: parsedAmount != null ? Math.round(parsedAmount) : 0,
            description: description || 'New Document',
            documentUrl,
            status: 'pending',
            date: new Date(),
            clubId: clubId !== null && clubId !== void 0 ? clubId : null,
        };
        try {
            const id = yield (0, firebaseAdmin_1.nextNumericId)('financialDocuments');
            yield firebaseAdmin_1.firestore.collection('financialDocuments').doc(String(id)).set(Object.assign({ id }, record));
            res.json(Object.assign(Object.assign({ id }, record), { date: new Date().toISOString() }));
        }
        catch (firestoreError) {
            console.error('[POST /api/finance/upload] Firestore fallback:', firestoreError);
            const inserted = yield db_1.db.insert(schema_1.financialDocuments).values({
                type: String(record.type),
                amount: record.amount,
                description: String(record.description),
                documentUrl,
                status: 'pending',
                clubId: record.clubId,
            }).returning();
            res.json(Object.assign(Object.assign({}, inserted[0]), { date: (_a = (0, firebaseAdmin_1.toIso)(inserted[0].date)) !== null && _a !== void 0 ? _a : new Date().toISOString() }));
        }
    }
    catch (error) {
        console.error('[POST /api/finance/upload] error:', error);
        if (req.file) {
            fs_1.default.unlink(req.file.path, () => { });
        }
        res.status(500).json({ error: 'Failed to upload document' });
    }
}));
router.get('/player/summary', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const currentPlayer = yield getCurrentPlayer(req);
        const currency = DEFAULT_PAYMENT_CURRENCY;
        const paymentRows = yield getPlayerPaymentRows(currentPlayer.data.id);
        const fees = yield buildPlayerFees(currentPlayer.data, paymentRows, currency);
        const outstandingAmount = fees.reduce((sum, fee) => sum + fee.amount, 0);
        res.json({
            playerName: getPlayerName(currentPlayer.data),
            playerEmail: (_a = currentPlayer.data.email) !== null && _a !== void 0 ? _a : null,
            billingCycle: `${formatBillingCycle()} Cycle`,
            dueLabel: buildDueLabel(fees),
            autoPayNote: 'Stripe Checkout is used for secure payments and saved cards.',
            outstandingAmount,
            currency,
            provider: 'stripe',
            stripe: {
                publishableKey: getStripePublishableKey(),
                configured: Boolean((_b = process.env.STRIPE_SECRET_KEY) === null || _b === void 0 ? void 0 : _b.trim()),
            },
            fees,
            paymentMethods: yield listPlayerPaymentMethods(currentPlayer.data),
            transactions: buildTransactions(paymentRows, currency),
        });
    }
    catch (error) {
        handleRouteError(res, error, '[GET /api/finance/player/summary]');
    }
}));
router.get('/stripe/config', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const user = yield (0, requestContext_1.requireRequestUser)(req, res);
    if (!user) {
        return;
    }
    const role = (0, requestAuth_1.normalizeRole)(user.role);
    if (!['admin', 'superadmin', 'accountant'].includes(role)) {
        res.status(403).json({ error: 'Admin finance access is required.' });
        return;
    }
    const publishableKey = getStripePublishableKey();
    const secretConfigured = Boolean((_a = process.env.STRIPE_SECRET_KEY) === null || _a === void 0 ? void 0 : _a.trim());
    const webhookConfigured = Boolean((_b = process.env.STRIPE_WEBHOOK_SECRET) === null || _b === void 0 ? void 0 : _b.trim());
    res.json({
        provider: 'stripe',
        mode: publishableKey.startsWith('pk_live_') ? 'live' : 'test',
        currency: DEFAULT_PAYMENT_CURRENCY,
        configured: secretConfigured,
        secretKeyConfigured: secretConfigured,
        publishableKeyConfigured: Boolean((_c = process.env.STRIPE_PUBLISHABLE_KEY) === null || _c === void 0 ? void 0 : _c.trim()),
        webhookSecretConfigured: webhookConfigured,
        publishableKey,
        webhookUrl: `${getAppBaseUrl(req)}/api/finance/stripe/webhook`,
    });
}));
router.get('/admin/recent-payments', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const clubId = yield resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }
        const parsedLimit = Number((_a = req.query) === null || _a === void 0 ? void 0 : _a.limit);
        const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
            ? Math.min(Math.floor(parsedLimit), 50)
            : 12;
        const parsedTeamId = Number((_b = req.query) === null || _b === void 0 ? void 0 : _b.teamId);
        const teamId = Number.isFinite(parsedTeamId) && parsedTeamId > 0 ? parsedTeamId : null;
        res.json(yield buildAdminRecentPayments(clubId, limit, teamId));
    }
    catch (error) {
        handleRouteError(res, error, '[GET /api/finance/admin/recent-payments]');
    }
}));
// Record a payment made outside Stripe (e.g. a player paying cash) so it shows
// up in the team payment report alongside online payments.
router.post('/admin/manual-payment', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const clubId = yield resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }
        const body = req.body;
        const playerId = Number(body.playerId);
        const amount = Number(body.amount);
        if (!Number.isFinite(playerId) || playerId <= 0) {
            res.status(400).json({ error: 'Jucătorul selectat este invalid.' });
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            res.status(400).json({ error: 'Suma trebuie să fie un număr mai mare ca 0.' });
            return;
        }
        const player = yield getPlayerByNumericId(playerId);
        if (!player) {
            res.status(404).json({ error: 'Jucătorul nu a fost găsit.' });
            return;
        }
        const method = (String((_a = body.method) !== null && _a !== void 0 ? _a : 'cash').trim().toLowerCase()) || 'cash';
        const description = typeof body.description === 'string' && body.description.trim()
            ? body.description.trim()
            : 'Plată numerar';
        const when = body.date ? ((_b = (0, firebaseAdmin_1.toDate)(body.date)) !== null && _b !== void 0 ? _b : new Date()) : new Date();
        const currency = DEFAULT_PAYMENT_CURRENCY;
        try {
            const id = yield (0, firebaseAdmin_1.nextNumericId)('playerPayments');
            const record = {
                id,
                playerId,
                amount: Math.round(amount),
                month: when.getMonth() + 1,
                year: when.getFullYear(),
                status: 'paid',
                date: when,
                createdAt: when,
                description,
                provider: method,
                currency,
                receiptUrl: null,
            };
            yield firebaseAdmin_1.firestore.collection('playerPayments').doc(String(id)).set(record);
            res.json({ success: true, payment: record });
            yield recordFinanceAudit(Object.assign({ action: 'finance.payment.manual', entityType: 'player_payment', entityId: id, clubId, metadata: {
                    store: 'firestore',
                    playerId,
                    amount: record.amount,
                    currency,
                    method,
                    month: record.month,
                    year: record.year,
                } }, financeAuditActor(req)));
        }
        catch (firestoreError) {
            if (!isFirestoreNotFound(firestoreError)) {
                console.error('[POST /api/finance/admin/manual-payment] Firestore fallback:', firestoreError);
            }
            const inserted = yield db_1.db
                .insert(schema_1.playerPayments)
                .values({
                playerId,
                amount: Math.round(amount),
                month: when.getMonth() + 1,
                year: when.getFullYear(),
                status: 'paid',
                date: when.toISOString(),
                createdAt: when.toISOString(),
            })
                .returning();
            res.json({ success: true, payment: inserted[0] });
            yield recordFinanceAudit(Object.assign({ action: 'finance.payment.manual', entityType: 'player_payment', entityId: (_d = (_c = inserted[0]) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null, clubId, metadata: {
                    store: 'postgres',
                    playerId,
                    amount: Math.round(amount),
                    currency,
                    method,
                    month: when.getMonth() + 1,
                    year: when.getFullYear(),
                } }, financeAuditActor(req)));
        }
    }
    catch (error) {
        handleRouteError(res, error, '[POST /api/finance/admin/manual-payment]');
    }
}));
router.post('/player/checkout-session', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const currentPlayer = yield getCurrentPlayer(req);
        const customerId = yield ensureStripeCustomer(currentPlayer);
        const currency = DEFAULT_PAYMENT_CURRENCY;
        const paymentRows = yield getPlayerPaymentRows(currentPlayer.data.id);
        const fees = selectedFeesFromBody(yield buildPlayerFees(currentPlayer.data, paymentRows, currency), (_a = req.body) === null || _a === void 0 ? void 0 : _a.feeIds);
        const payableFees = fees.filter((fee) => fee.amount > 0);
        const totalAmount = payableFees.reduce((sum, fee) => sum + fee.amount, 0);
        if (!payableFees.length || totalAmount <= 0) {
            res.status(400).json({ error: 'There is no payable balance for this player.' });
            return;
        }
        const stripe = getStripe();
        const returnUrl = getPaymentsReturnUrl(req);
        const label = payableFees.length === 1 ? payableFees[0].label : 'Player balance payment';
        const feeIds = payableFees.map((fee) => fee.id);
        const session = yield stripe.checkout.sessions.create({
            mode: 'payment',
            customer: customerId,
            line_items: payableFees.map((fee) => ({
                quantity: 1,
                price_data: {
                    currency: fee.currency,
                    unit_amount: toMinorUnits(fee.amount, fee.currency),
                    product_data: {
                        name: fee.label,
                        description: fee.description,
                    },
                },
            })),
            success_url: appendQuery(returnUrl, 'payment_session_id={CHECKOUT_SESSION_ID}'),
            cancel_url: appendQuery(returnUrl, 'payment_status=cancelled'),
            payment_intent_data: {
                setup_future_usage: 'off_session',
                metadata: {
                    source: 'player_payments',
                    playerId: String(currentPlayer.data.id),
                    feeIds: feeIds.join(','),
                    label,
                },
            },
            metadata: {
                source: 'player_payments',
                playerId: String(currentPlayer.data.id),
                feeIds: feeIds.join(','),
                label,
            },
        });
        res.json({
            id: session.id,
            url: session.url,
        });
    }
    catch (error) {
        handleRouteError(res, error, '[POST /api/finance/player/checkout-session]');
    }
}));
router.post('/player/setup-session', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentPlayer = yield getCurrentPlayer(req);
        const customerId = yield ensureStripeCustomer(currentPlayer);
        const stripe = getStripe();
        const returnUrl = getPaymentsReturnUrl(req);
        const session = yield stripe.checkout.sessions.create({
            mode: 'setup',
            customer: customerId,
            payment_method_types: ['card'],
            success_url: appendQuery(returnUrl, 'setup_session_id={CHECKOUT_SESSION_ID}'),
            cancel_url: appendQuery(returnUrl, 'payment_status=cancelled'),
            setup_intent_data: {
                metadata: {
                    source: 'player_payment_methods',
                    playerId: String(currentPlayer.data.id),
                },
            },
            metadata: {
                source: 'player_payment_methods',
                playerId: String(currentPlayer.data.id),
            },
        });
        res.json({
            id: session.id,
            url: session.url,
        });
    }
    catch (error) {
        handleRouteError(res, error, '[POST /api/finance/player/setup-session]');
    }
}));
router.post('/player/confirm-checkout-session', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const currentPlayer = yield getCurrentPlayer(req);
        const { sessionId } = req.body;
        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required.' });
            return;
        }
        const stripe = getStripe();
        const session = yield stripe.checkout.sessions.retrieve(sessionId);
        const sessionPlayerId = Number((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.playerId);
        if (sessionPlayerId !== currentPlayer.data.id) {
            res.status(403).json({ error: 'This payment session does not belong to the signed-in player.' });
            return;
        }
        const fulfillment = yield fulfillPaidCheckoutSession(sessionId);
        res.json({
            success: true,
            fulfillment,
        });
    }
    catch (error) {
        handleRouteError(res, error, '[POST /api/finance/player/confirm-checkout-session]');
    }
}));
router.post('/player/confirm-setup-session', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const currentPlayer = yield getCurrentPlayer(req);
        const { sessionId } = req.body;
        if (!sessionId) {
            res.status(400).json({ error: 'sessionId is required.' });
            return;
        }
        const stripe = getStripe();
        const session = yield stripe.checkout.sessions.retrieve(sessionId);
        const sessionPlayerId = Number((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.playerId);
        if (sessionPlayerId !== currentPlayer.data.id) {
            res.status(403).json({ error: 'This setup session does not belong to the signed-in player.' });
            return;
        }
        if (session.mode !== 'setup' || session.status !== 'complete') {
            res.status(400).json({ error: 'Stripe setup session is not complete yet.' });
            return;
        }
        res.json({
            success: true,
            paymentMethods: yield listPlayerPaymentMethods(currentPlayer.data),
        });
    }
    catch (error) {
        handleRouteError(res, error, '[POST /api/finance/player/confirm-setup-session]');
    }
}));
router.get('/settings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        const user = yield (0, requestContext_1.requireRequestUser)(req, res);
        if (!user) {
            return;
        }
        const clubId = (user === null || user === void 0 ? void 0 : user.clubId) != null ? Number(user.clubId) : null;
        const data = yield getSettingsData(clubId);
        res.json(Object.assign(Object.assign({}, data), { id: (_b = (_a = data.id) !== null && _a !== void 0 ? _a : clubId) !== null && _b !== void 0 ? _b : 1, clubId: (_c = data.clubId) !== null && _c !== void 0 ? _c : clubId, monthlyPlayerFee: (_d = normalizeMoneyValue(data.monthlyPlayerFee)) !== null && _d !== void 0 ? _d : 0, trainingLevy: (_e = normalizeMoneyValue(data.trainingLevy)) !== null && _e !== void 0 ? _e : 0, facilityFee: (_f = normalizeMoneyValue(data.facilityFee)) !== null && _f !== void 0 ? _f : 0, autoAdjust: Number((_g = data.autoAdjust) !== null && _g !== void 0 ? _g : 1) ? 1 : 0, paymentDueDay: resolveDueDay(data.paymentDueDay), updatedAt: (_h = (0, firebaseAdmin_1.toIso)(data.updatedAt)) !== null && _h !== void 0 ? _h : new Date().toISOString() }));
    }
    catch (error) {
        console.error('[GET /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to load settings' });
    }
}));
router.patch('/settings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    try {
        const clubId = yield resolveAdminFinanceClubId(req, res);
        if (clubId === null && res.headersSent) {
            return;
        }
        const { monthlyPlayerFee, trainingLevy, facilityFee, autoAdjust, paymentDueDay } = req.body;
        const updates = {
            id: clubId !== null && clubId !== void 0 ? clubId : 1,
            clubId: clubId !== null && clubId !== void 0 ? clubId : null,
            updatedAt: new Date(),
        };
        if (paymentDueDay !== undefined) {
            const day = normalizeDueDay(paymentDueDay);
            if (day == null) {
                res.status(400).json({ error: 'paymentDueDay must be a day between 1 and 31.' });
                return;
            }
            updates.paymentDueDay = day;
        }
        if (monthlyPlayerFee !== undefined) {
            const amount = normalizeMoneyValue(monthlyPlayerFee);
            if (amount == null) {
                res.status(400).json({ error: 'monthlyPlayerFee must be a positive number or zero.' });
                return;
            }
            updates.monthlyPlayerFee = amount;
        }
        if (trainingLevy !== undefined) {
            const amount = normalizeMoneyValue(trainingLevy);
            if (amount == null) {
                res.status(400).json({ error: 'trainingLevy must be a positive number or zero.' });
                return;
            }
            updates.trainingLevy = amount;
        }
        if (facilityFee !== undefined) {
            const amount = normalizeMoneyValue(facilityFee);
            if (amount == null) {
                res.status(400).json({ error: 'facilityFee must be a positive number or zero.' });
                return;
            }
            updates.facilityFee = amount;
        }
        if (autoAdjust !== undefined) {
            updates.autoAdjust = Number(autoAdjust) ? 1 : 0;
        }
        try {
            const ref = firebaseAdmin_1.firestore.collection('financialSettings').doc(getSettingsDocId(clubId));
            yield ensureSettings(clubId);
            // Captured before the write so the audit row can carry what the fees were,
            // which is the evidence this endpoint has never produced.
            const beforeSnap = yield ref.get();
            const before = beforeSnap.data();
            yield ref.set(updates, { merge: true });
            const snap = yield ref.get();
            const data = snap.data();
            res.json(Object.assign(Object.assign({}, data), { monthlyPlayerFee: (_a = normalizeMoneyValue(data.monthlyPlayerFee)) !== null && _a !== void 0 ? _a : 0, trainingLevy: (_b = normalizeMoneyValue(data.trainingLevy)) !== null && _b !== void 0 ? _b : 0, facilityFee: (_c = normalizeMoneyValue(data.facilityFee)) !== null && _c !== void 0 ? _c : 0, autoAdjust: Number((_d = data.autoAdjust) !== null && _d !== void 0 ? _d : 1) ? 1 : 0, paymentDueDay: resolveDueDay(data.paymentDueDay), updatedAt: (_e = (0, firebaseAdmin_1.toIso)(data.updatedAt)) !== null && _e !== void 0 ? _e : new Date().toISOString() }));
            yield recordFinanceAudit(Object.assign({ action: 'finance.settings.update', entityType: 'financial_settings', entityId: clubId, clubId, metadata: { store: 'firestore', changes: settingsAuditChanges(before, updates) } }, financeAuditActor(req)));
            return;
        }
        catch (error) {
            if (!isFirestoreNotFound(error)) {
                console.error('[PATCH /api/finance/settings] Firestore settings fallback:', error);
            }
        }
        const pgUpdates = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (updates.monthlyPlayerFee !== undefined ? { monthlyPlayerFee: Number(updates.monthlyPlayerFee) } : {})), (updates.trainingLevy !== undefined ? { trainingLevy: Number(updates.trainingLevy) } : {})), (updates.facilityFee !== undefined ? { facilityFee: Number(updates.facilityFee) } : {})), (updates.autoAdjust !== undefined ? { autoAdjust: Number(updates.autoAdjust) } : {})), (updates.paymentDueDay !== undefined ? { paymentDueDay: Number(updates.paymentDueDay) } : {})), { updatedAt: new Date().toISOString() });
        // Must use the same key as getSettingsData, which now reads by club id. Left
        // hardcoded to 1, a club would write its fees into the legacy row and then read
        // back its own (empty) row — silently losing every settings change.
        const settingsRowId = clubId !== null && clubId !== void 0 ? clubId : financeDefaults_1.DEFAULT_SETTINGS_ROW_ID;
        const existingRows = yield db_1.db.select().from(schema_1.financialSettings).where((0, drizzle_orm_1.eq)(schema_1.financialSettings.id, settingsRowId)).limit(1);
        const data = existingRows[0]
            ? (yield db_1.db.update(schema_1.financialSettings).set(pgUpdates).where((0, drizzle_orm_1.eq)(schema_1.financialSettings.id, settingsRowId)).returning())[0]
            : (yield db_1.db.insert(schema_1.financialSettings).values({
                id: settingsRowId,
                monthlyPlayerFee: Number((_f = updates.monthlyPlayerFee) !== null && _f !== void 0 ? _f : 0),
                trainingLevy: Number((_g = updates.trainingLevy) !== null && _g !== void 0 ? _g : 0),
                facilityFee: Number((_h = updates.facilityFee) !== null && _h !== void 0 ? _h : 0),
                autoAdjust: Number((_j = updates.autoAdjust) !== null && _j !== void 0 ? _j : 1),
                paymentDueDay: Number((_k = updates.paymentDueDay) !== null && _k !== void 0 ? _k : financeDefaults_1.DEFAULT_PAYMENT_DUE_DAY),
                updatedAt: new Date().toISOString(),
            }).returning())[0];
        res.json(Object.assign(Object.assign({}, data), { monthlyPlayerFee: (_l = normalizeMoneyValue(data.monthlyPlayerFee)) !== null && _l !== void 0 ? _l : 0, trainingLevy: (_m = normalizeMoneyValue(data.trainingLevy)) !== null && _m !== void 0 ? _m : 0, facilityFee: (_o = normalizeMoneyValue(data.facilityFee)) !== null && _o !== void 0 ? _o : 0, autoAdjust: Number((_p = data.autoAdjust) !== null && _p !== void 0 ? _p : 1) ? 1 : 0, paymentDueDay: resolveDueDay(data.paymentDueDay), updatedAt: (_q = (0, firebaseAdmin_1.toIso)(data.updatedAt)) !== null && _q !== void 0 ? _q : new Date().toISOString() }));
        yield recordFinanceAudit(Object.assign({ action: 'finance.settings.update', entityType: 'financial_settings', entityId: settingsRowId, clubId, metadata: { store: 'postgres', changes: settingsAuditChanges(existingRows[0], updates) } }, financeAuditActor(req)));
    }
    catch (error) {
        console.error('[PATCH /api/finance/settings]', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
}));
exports.default = router;

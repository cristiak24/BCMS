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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmail = normalizeEmail;
exports.normalizeClubName = normalizeClubName;
exports.hashInviteToken = hashInviteToken;
exports.generateInviteToken = generateInviteToken;
exports.buildInviteUrl = buildInviteUrl;
exports.isInviteExpired = isInviteExpired;
exports.isVisiblePendingInvite = isVisiblePendingInvite;
exports.syncInvitationStatuses = syncInvitationStatuses;
exports.createSuperAdminInvitation = createSuperAdminInvitation;
exports.validateInvitationToken = validateInvitationToken;
exports.acceptInvitation = acceptInvitation;
exports.completeUserRegistration = completeUserRegistration;
exports.listInvitations = listInvitations;
const crypto_1 = __importDefault(require("crypto"));
const resend_1 = require("resend");
const drizzle_orm_1 = require("drizzle-orm");
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const auditService_1 = require("./auditService");
const loadEnv_1 = require("../lib/loadEnv");
const publicUrl_1 = require("../lib/publicUrl");
(0, loadEnv_1.loadServerEnv)();
const RESEND_API_KEY = ((_a = process.env.RESEND_API_KEY) === null || _a === void 0 ? void 0 : _a.trim()) || '';
const RESEND_FROM_EMAIL = ((_b = process.env.RESEND_FROM_EMAIL) === null || _b === void 0 ? void 0 : _b.trim()) || 'BCMS <no-reply@bcms.ro>';
const INVITE_TTL_MINUTES = Number((_c = process.env.INVITE_EXPIRATION_MINUTES) !== null && _c !== void 0 ? _c : 10) || 10;
const resend = RESEND_API_KEY ? new resend_1.Resend(RESEND_API_KEY) : null;
function normalizeEmail(value) {
    return value.trim().toLowerCase();
}
function normalizeClubName(value) {
    return value.trim().replace(/\s+/g, ' ');
}
function hashInviteToken(token) {
    return crypto_1.default.createHash('sha256').update(token).digest('hex');
}
function generateInviteToken() {
    return crypto_1.default.randomBytes(32).toString('base64url');
}
function buildInviteUrl(token) {
    return `${(0, publicUrl_1.resolvePublicAppUrl)()}/invite/${encodeURIComponent(token)}`;
}
function invitationUserKey(email, clubId) {
    return `${normalizeEmail(email)}:${clubId !== null && clubId !== void 0 ? clubId : 'none'}`;
}
function isInviteExpired(invite, now = new Date()) {
    return new Date(invite.expiresAt).getTime() <= now.getTime();
}
function isVisiblePendingInvite(invite, userRows, now = new Date()) {
    if (invite.status !== 'pending' || isInviteExpired(invite, now)) {
        return false;
    }
    const matchingUser = userRows.some((user) => invitationUserKey(user.email, user.clubId) === invitationUserKey(invite.email, invite.clubId));
    return !matchingUser;
}
function syncInvitationStatuses() {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const nowIso = now.toISOString();
        yield db_1.db
            .update(schema_1.invites)
            .set({ status: 'expired' })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.invites.status, 'pending'), (0, drizzle_orm_1.lte)(schema_1.invites.expiresAt, nowIso)));
        const [pendingInvites, userRows] = yield Promise.all([
            db_1.db.select().from(schema_1.invites).where((0, drizzle_orm_1.eq)(schema_1.invites.status, 'pending')),
            db_1.db.select({
                id: schema_1.users.id,
                email: schema_1.users.email,
                clubId: schema_1.users.clubId,
            }).from(schema_1.users),
        ]);
        const usersByInviteKey = new Map(userRows.map((user) => [invitationUserKey(user.email, user.clubId), user]));
        const acceptedAt = new Date().toISOString();
        yield Promise.all(pendingInvites.map((invite) => {
            var _a;
            const matchingUser = usersByInviteKey.get(invitationUserKey(invite.email, invite.clubId));
            if (!matchingUser) {
                return Promise.resolve();
            }
            return db_1.db.update(schema_1.invites).set({
                status: 'accepted',
                usedBy: matchingUser.id,
                usedAt: (_a = invite.usedAt) !== null && _a !== void 0 ? _a : acceptedAt,
            }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
        }));
    });
}
function findClubById(clubId) {
    return __awaiter(this, void 0, void 0, function* () {
        const clubRows = yield db_1.db.select().from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, clubId)).limit(1);
        const club = clubRows[0];
        if (!club) {
            throw new Error('Club not found.');
        }
        return club;
    });
}
function sendInviteEmail(params) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!resend) {
            throw new Error('RESEND_API_KEY is missing.');
        }
        const expiresLabel = params.expiresAt.toLocaleString('en-US', {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
        yield resend.emails.send({
            from: RESEND_FROM_EMAIL,
            to: params.to,
            subject: `Invitation to join ${params.clubName}`,
            html: `
      <div style="margin:0;padding:0;background:#eef3ff;font-family:Inter,Arial,sans-serif">
        <div style="max-width:640px;margin:0 auto;padding:32px 18px">
          <div style="background:#fff;border:1px solid #dbe4ff;border-radius:28px;padding:32px;box-shadow:0 24px 70px rgba(23,58,168,.08)">
            <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:#e7eeff;color:#173aa8;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">BCMS invitation</div>
            <h1 style="margin:20px 0 12px;font-size:30px;line-height:1.1;color:#102a72">Finish your registration</h1>
            ${params.fullName ? `<p style="font-size:16px;line-height:1.7;color:#334155;margin:0 0 10px">Hi ${params.fullName},</p>` : ''}
            <p style="font-size:16px;line-height:1.7;color:#334155;margin:0 0 10px">You were invited to join <strong>${params.clubName}</strong> as <strong>${params.role}</strong>.</p>
            <p style="font-size:14px;line-height:1.7;color:#64748b;margin:0 0 10px">This invitation expires in 10 minutes and can be used only once.</p>
            <p style="font-size:13px;line-height:1.7;color:#64748b;margin:0 0 22px">Expires at ${expiresLabel}.</p>
            <p style="margin:0 0 18px">
              <a href="${params.url}" style="display:inline-block;background:#173aa8;color:#fff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:800">Complete registration</a>
            </p>
            <p style="font-size:13px;color:#64748b;word-break:break-all;line-height:1.5;margin:0">${params.url}</p>
          </div>
        </div>
      </div>
    `,
            text: `${params.fullName ? `Hi ${params.fullName}. ` : ''}You were invited to ${params.clubName} as ${params.role}. This invitation expires in 10 minutes. Complete registration: ${params.url}`,
        });
    });
}
function createSuperAdminInvitation(input_1) {
    return __awaiter(this, arguments, void 0, function* (input, actor = {}) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const email = normalizeEmail(input.email);
        const fullName = typeof input.fullName === 'string' ? input.fullName.trim().replace(/\s+/g, ' ') : '';
        const role = input.role;
        const clubId = Number(input.clubId);
        if (!email) {
            throw new Error('Email is required.');
        }
        if (!fullName) {
            throw new Error('Full name is required.');
        }
        if (Number.isNaN(clubId) || clubId <= 0) {
            throw new Error('A valid club is required.');
        }
        const club = yield findClubById(clubId);
        const token = generateInviteToken();
        const tokenHash = hashInviteToken(token);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + INVITE_TTL_MINUTES * 60 * 1000);
        const inserted = yield db_1.db.insert(schema_1.invites).values({
            token,
            email,
            role,
            clubId: club.id,
            tokenHash,
            status: 'pending',
            expiresAt: expiresAt.toISOString(),
            createdBy: (_b = (_a = actor.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null,
        }).returning();
        const invite = inserted[0];
        const inviteUrl = buildInviteUrl(token);
        try {
            yield sendInviteEmail({
                to: email,
                clubName: club.name,
                role,
                url: inviteUrl,
                expiresAt,
                fullName,
            });
        }
        catch (error) {
            yield db_1.db.update(schema_1.invites).set({ status: 'revoked' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
            throw error;
        }
        yield (0, auditService_1.writeAuditLog)({
            action: 'invitation.created',
            entityType: 'invitation',
            entityId: invite.id,
            actorUserId: (_d = (_c = actor.user) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null,
            actorUid: (_f = (_e = actor.firebaseUser) === null || _e === void 0 ? void 0 : _e.uid) !== null && _f !== void 0 ? _f : null,
            actorRole: (_k = (_h = (_g = actor.user) === null || _g === void 0 ? void 0 : _g.role) !== null && _h !== void 0 ? _h : (_j = actor.firebaseUser) === null || _j === void 0 ? void 0 : _j.role) !== null && _k !== void 0 ? _k : null,
            clubId: club.id,
            metadata: { email, fullName, role, clubId: club.id, clubName: club.name },
            ipAddress: (_l = actor.ip) !== null && _l !== void 0 ? _l : null,
            userAgent: (_m = actor.userAgent) !== null && _m !== void 0 ? _m : null,
        });
        return {
            id: invite.id,
            token,
            email,
            role,
            clubId: club.id,
            clubName: club.name,
            fullName,
            status: 'pending',
            expiresAt: expiresAt.toISOString(),
            inviteUrl,
        };
    });
}
function validateInvitationToken(token) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        yield syncInvitationStatuses();
        const tokenHash = hashInviteToken(token);
        const rows = yield db_1.db.select({
            id: schema_1.invites.id,
            token: schema_1.invites.token,
            email: schema_1.invites.email,
            role: schema_1.invites.role,
            clubId: schema_1.invites.clubId,
            status: schema_1.invites.status,
            expiresAt: schema_1.invites.expiresAt,
            createdAt: schema_1.invites.createdAt,
            usedAt: schema_1.invites.usedAt,
            usedBy: schema_1.invites.usedBy,
        }).from(schema_1.invites).where((0, drizzle_orm_1.eq)(schema_1.invites.tokenHash, tokenHash)).limit(1);
        const invite = rows[0];
        if (!invite) {
            return null;
        }
        const clubRows = invite.clubId == null
            ? []
            : yield db_1.db.select({ name: schema_1.clubs.name }).from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, invite.clubId)).limit(1);
        const clubName = (_b = (_a = clubRows[0]) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : null;
        const isExpired = new Date(invite.expiresAt).getTime() <= Date.now();
        const status = isExpired ? 'expired' : invite.status;
        if (isExpired && invite.status !== 'expired') {
            yield db_1.db.update(schema_1.invites).set({ status: 'expired' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
        }
        const canAccept = !isExpired && (status === 'pending' || status === 'accepted');
        return {
            id: invite.id,
            token: invite.token,
            email: invite.email,
            role: invite.role,
            clubId: invite.clubId,
            clubName,
            status,
            expiresAt: invite.expiresAt,
            createdAt: invite.createdAt,
            usedAt: invite.usedAt,
            usedBy: invite.usedBy,
            isExpired,
            canAccept,
            message: isExpired
                ? 'This invitation has expired. Ask a Super Admin to send a new one.'
                : status === 'revoked'
                    ? 'This invitation has been revoked.'
                    : status === 'accepted'
                        ? 'This invitation was already accepted. You can finish activating the account again.'
                        : null,
        };
    });
}
function acceptInvitation(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const tokenHash = hashInviteToken(params.token);
        const inviteRows = yield db_1.db.select().from(schema_1.invites).where((0, drizzle_orm_1.eq)(schema_1.invites.tokenHash, tokenHash)).limit(1);
        const invite = inviteRows[0];
        if (!invite) {
            throw new Error('Invite not found.');
        }
        if (normalizeEmail(params.email) !== normalizeEmail(invite.email)) {
            throw new Error('This invitation is for a different email address.');
        }
        if (invite.status === 'revoked') {
            throw new Error('Invite has been revoked.');
        }
        if (invite.status !== 'accepted' && new Date(invite.expiresAt).getTime() <= Date.now()) {
            yield db_1.db.update(schema_1.invites).set({ status: 'expired' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
            throw new Error('Invite expired.');
        }
        const userRows = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.users.firebaseUid, params.firebaseUid), (0, drizzle_orm_1.eq)(schema_1.users.email, normalizeEmail(params.email)))).limit(1);
        const displayName = [params.firstName, params.lastName].filter(Boolean).join(' ').trim() || params.email.split('@')[0] || 'New User';
        const firstName = ((_a = params.firstName) === null || _a === void 0 ? void 0 : _a.trim()) || null;
        const lastName = ((_b = params.lastName) === null || _b === void 0 ? void 0 : _b.trim()) || null;
        let userId;
        if (userRows[0]) {
            const updated = yield db_1.db.update(schema_1.users).set({
                firebaseUid: params.firebaseUid,
                email: normalizeEmail(params.email),
                name: displayName,
                firstName,
                lastName,
                role: invite.role,
                status: 'active',
                clubId: invite.clubId,
                phone: (_c = params.phone) !== null && _c !== void 0 ? _c : null,
                updatedAt: new Date().toISOString(),
            }).where((0, drizzle_orm_1.eq)(schema_1.users.id, userRows[0].id)).returning();
            userId = updated[0].id;
        }
        else {
            const inserted = yield db_1.db.insert(schema_1.users).values({
                firebaseUid: params.firebaseUid,
                email: normalizeEmail(params.email),
                name: displayName,
                firstName,
                lastName,
                role: invite.role,
                status: 'active',
                clubId: invite.clubId,
                phone: (_d = params.phone) !== null && _d !== void 0 ? _d : null,
            }).returning();
            userId = inserted[0].id;
        }
        yield db_1.db.update(schema_1.invites).set({
            status: 'accepted',
            usedBy: userId,
            usedAt: (_e = invite.usedAt) !== null && _e !== void 0 ? _e : new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
        yield (0, auditService_1.writeAuditLog)({
            action: 'invitation.accepted',
            entityType: 'invitation',
            entityId: invite.id,
            actorUserId: userId,
            actorUid: params.firebaseUid,
            actorRole: invite.role,
            clubId: (_f = invite.clubId) !== null && _f !== void 0 ? _f : null,
            metadata: { email: params.email, role: invite.role, clubId: invite.clubId },
        });
        return {
            userId,
            clubId: invite.clubId,
            role: invite.role,
            status: 'active',
        };
    });
}
function completeUserRegistration(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        const rows = yield db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.firebaseUid, params.firebaseUid)).limit(1);
        const user = rows[0];
        if (!user) {
            throw new Error('User not found.');
        }
        const name = `${params.firstName.trim()} ${params.lastName.trim()}`.trim();
        const updated = yield db_1.db.update(schema_1.users).set({
            name,
            firstName: params.firstName.trim(),
            lastName: params.lastName.trim(),
            phone: (_b = (_a = params.phone) !== null && _a !== void 0 ? _a : user.phone) !== null && _b !== void 0 ? _b : null,
            avatarUrl: (_d = (_c = params.avatarUrl) !== null && _c !== void 0 ? _c : user.avatarUrl) !== null && _d !== void 0 ? _d : null,
            status: 'active',
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id)).returning();
        yield (0, auditService_1.writeAuditLog)({
            action: 'user.registration_completed',
            entityType: 'user',
            entityId: user.id,
            actorUserId: user.id,
            actorUid: params.firebaseUid,
            actorRole: user.role,
            clubId: (_e = user.clubId) !== null && _e !== void 0 ? _e : null,
            metadata: {
                firstName: params.firstName,
                lastName: params.lastName,
                phone: (_f = params.phone) !== null && _f !== void 0 ? _f : null,
                dateOfBirth: (_g = params.dateOfBirth) !== null && _g !== void 0 ? _g : null,
            },
        });
        return updated[0];
    });
}
function listInvitations() {
    return __awaiter(this, void 0, void 0, function* () {
        yield syncInvitationStatuses();
        const rows = yield db_1.db.select({
            id: schema_1.invites.id,
            token: schema_1.invites.token,
            email: schema_1.invites.email,
            role: schema_1.invites.role,
            clubId: schema_1.invites.clubId,
            status: schema_1.invites.status,
            expiresAt: schema_1.invites.expiresAt,
            createdAt: schema_1.invites.createdAt,
            usedAt: schema_1.invites.usedAt,
            usedBy: schema_1.invites.usedBy,
            clubName: schema_1.clubs.name,
        }).from(schema_1.invites).leftJoin(schema_1.clubs, (0, drizzle_orm_1.eq)(schema_1.invites.clubId, schema_1.clubs.id)).orderBy((0, drizzle_orm_1.desc)(schema_1.invites.createdAt));
        return rows.map((row) => {
            var _a;
            return (Object.assign(Object.assign({}, row), { clubName: (_a = row.clubName) !== null && _a !== void 0 ? _a : null }));
        });
    });
}

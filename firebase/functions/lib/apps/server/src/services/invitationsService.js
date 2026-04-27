"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEmail = normalizeEmail;
exports.normalizeClubName = normalizeClubName;
exports.hashInviteToken = hashInviteToken;
exports.generateInviteToken = generateInviteToken;
exports.buildInviteUrl = buildInviteUrl;
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
(0, loadEnv_1.loadServerEnv)();
const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL?.trim() || 'BCMS <onboarding@resend.dev>';
const APP_PUBLIC_URL = process.env.APP_BASE_URL?.trim() || process.env.FRONTEND_URL?.trim() || 'http://localhost:8081';
const INVITE_TTL_MINUTES = Number(process.env.INVITE_EXPIRATION_MINUTES ?? 10) || 10;
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
    return `${APP_PUBLIC_URL.replace(/\/+$/, '')}/invite/${encodeURIComponent(token)}`;
}
async function findClubById(clubId) {
    const clubRows = await db_1.db.select().from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, clubId)).limit(1);
    const club = clubRows[0];
    if (!club) {
        throw new Error('Club not found.');
    }
    return club;
}
async function sendInviteEmail(params) {
    if (!resend) {
        throw new Error('RESEND_API_KEY is missing.');
    }
    const expiresLabel = params.expiresAt.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    await resend.emails.send({
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
}
async function createSuperAdminInvitation(input, actor = {}) {
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
    const club = await findClubById(clubId);
    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MINUTES * 60 * 1000);
    const inserted = await db_1.db.insert(schema_1.invites).values({
        token,
        email,
        role,
        clubId: club.id,
        tokenHash,
        status: 'pending',
        expiresAt: expiresAt.toISOString(),
        createdBy: actor.user?.id ?? null,
    }).returning();
    const invite = inserted[0];
    const inviteUrl = buildInviteUrl(token);
    try {
        await sendInviteEmail({
            to: email,
            clubName: club.name,
            role,
            url: inviteUrl,
            expiresAt,
            fullName,
        });
    }
    catch (error) {
        await db_1.db.update(schema_1.invites).set({ status: 'revoked' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
        throw error;
    }
    await (0, auditService_1.writeAuditLog)({
        action: 'invitation.created',
        entityType: 'invitation',
        entityId: invite.id,
        actorUserId: actor.user?.id ?? null,
        actorUid: actor.firebaseUser?.uid ?? null,
        actorRole: actor.user?.role ?? actor.firebaseUser?.role ?? null,
        clubId: club.id,
        metadata: { email, fullName, role, clubId: club.id, clubName: club.name },
        ipAddress: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
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
}
async function validateInvitationToken(token) {
    const tokenHash = hashInviteToken(token);
    const rows = await db_1.db.select({
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
        : await db_1.db.select({ name: schema_1.clubs.name }).from(schema_1.clubs).where((0, drizzle_orm_1.eq)(schema_1.clubs.id, invite.clubId)).limit(1);
    const clubName = clubRows[0]?.name ?? null;
    const isExpired = new Date(invite.expiresAt).getTime() <= Date.now();
    const status = isExpired ? 'expired' : invite.status;
    if (isExpired && invite.status !== 'expired') {
        await db_1.db.update(schema_1.invites).set({ status: 'expired' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
    }
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
        canAccept: !isExpired && status === 'pending',
        message: isExpired
            ? 'This invitation has expired. Ask a Super Admin to send a new one.'
            : status === 'revoked'
                ? 'This invitation has been revoked.'
                : status === 'accepted'
                    ? 'This invitation has already been used.'
                    : null,
    };
}
async function acceptInvitation(params) {
    const tokenHash = hashInviteToken(params.token);
    const inviteRows = await db_1.db.select().from(schema_1.invites).where((0, drizzle_orm_1.eq)(schema_1.invites.tokenHash, tokenHash)).limit(1);
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
    if (invite.status === 'accepted') {
        throw new Error('Invite has already been accepted.');
    }
    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
        await db_1.db.update(schema_1.invites).set({ status: 'expired' }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
        throw new Error('Invite expired.');
    }
    const userRows = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.users.firebaseUid, params.firebaseUid), (0, drizzle_orm_1.eq)(schema_1.users.email, normalizeEmail(params.email)))).limit(1);
    const displayName = [params.firstName, params.lastName].filter(Boolean).join(' ').trim() || params.email.split('@')[0] || 'New User';
    const firstName = params.firstName?.trim() || null;
    const lastName = params.lastName?.trim() || null;
    let userId;
    if (userRows[0]) {
        const updated = await db_1.db.update(schema_1.users).set({
            firebaseUid: params.firebaseUid,
            email: normalizeEmail(params.email),
            name: displayName,
            firstName,
            lastName,
            role: invite.role,
            status: 'active',
            clubId: invite.clubId,
            phone: params.phone ?? null,
            updatedAt: new Date().toISOString(),
        }).where((0, drizzle_orm_1.eq)(schema_1.users.id, userRows[0].id)).returning();
        userId = updated[0].id;
    }
    else {
        const inserted = await db_1.db.insert(schema_1.users).values({
            firebaseUid: params.firebaseUid,
            email: normalizeEmail(params.email),
            name: displayName,
            firstName,
            lastName,
            role: invite.role,
            status: 'active',
            clubId: invite.clubId,
            phone: params.phone ?? null,
        }).returning();
        userId = inserted[0].id;
    }
    await db_1.db.update(schema_1.invites).set({
        status: 'accepted',
        usedBy: userId,
        usedAt: new Date().toISOString(),
    }).where((0, drizzle_orm_1.eq)(schema_1.invites.id, invite.id));
    await (0, auditService_1.writeAuditLog)({
        action: 'invitation.accepted',
        entityType: 'invitation',
        entityId: invite.id,
        actorUserId: userId,
        actorUid: params.firebaseUid,
        actorRole: invite.role,
        clubId: invite.clubId ?? null,
        metadata: { email: params.email, role: invite.role, clubId: invite.clubId },
    });
    return {
        userId,
        clubId: invite.clubId,
        role: invite.role,
        status: 'active',
    };
}
async function completeUserRegistration(params) {
    const rows = await db_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.firebaseUid, params.firebaseUid)).limit(1);
    const user = rows[0];
    if (!user) {
        throw new Error('User not found.');
    }
    const name = `${params.firstName.trim()} ${params.lastName.trim()}`.trim();
    const updated = await db_1.db.update(schema_1.users).set({
        name,
        firstName: params.firstName.trim(),
        lastName: params.lastName.trim(),
        phone: params.phone ?? user.phone ?? null,
        avatarUrl: params.avatarUrl ?? user.avatarUrl ?? null,
        status: 'active',
        updatedAt: new Date().toISOString(),
    }).where((0, drizzle_orm_1.eq)(schema_1.users.id, user.id)).returning();
    await (0, auditService_1.writeAuditLog)({
        action: 'user.registration_completed',
        entityType: 'user',
        entityId: user.id,
        actorUserId: user.id,
        actorUid: params.firebaseUid,
        actorRole: user.role,
        clubId: user.clubId ?? null,
        metadata: {
            firstName: params.firstName,
            lastName: params.lastName,
            phone: params.phone ?? null,
            dateOfBirth: params.dateOfBirth ?? null,
        },
    });
    return updated[0];
}
async function listInvitations() {
    const rows = await db_1.db.select({
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
    return rows.map((row) => ({
        ...row,
        clubName: row.clubName ?? null,
    }));
}

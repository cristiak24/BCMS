import crypto from 'crypto';
import { Resend } from 'resend';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { clubs, invites, users } from '../db/schema';
import { writeAuditLog } from './auditService';
import type { AuthenticatedRequest } from '../middleware/auth';
import { loadServerEnv } from '../lib/loadEnv';
import { resolvePublicAppUrl } from '../lib/publicUrl';
import { inviteTtlMinutes } from '../lib/inviteTtl';
import { publicUser } from '../lib/publicUser';
import { canLinkToUid } from '../lib/identityLink';

loadServerEnv();

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL?.trim() || 'BCMS <no-reply@bcms.ro>';
const INVITE_TTL_MINUTES = inviteTtlMinutes(process.env);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export type SuperAdminInviteInput = {
  email: string;
  fullName?: string;
  role: 'admin' | 'coach' | 'staff' | 'player' | 'parent' | 'accountant';
  clubId: number;
};

const INVITABLE_ROLES = new Set<string>(['admin', 'coach', 'staff', 'player', 'parent', 'accountant']);

export type InvitationRecord = {
  id: number;
  token: string;
  email: string;
  role: string;
  clubId: number | null;
  clubName: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  usedAt?: string | null;
  usedBy?: number | null;
};

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeClubName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function hashInviteToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function buildInviteUrl(token: string) {
  return `${resolvePublicAppUrl()}/invite/${encodeURIComponent(token)}`;
}

function invitationUserKey(email: string, clubId: number | null) {
  return `${normalizeEmail(email)}:${clubId ?? 'none'}`;
}

export function isInviteExpired(invite: Pick<typeof invites.$inferSelect, 'expiresAt'>, now = new Date()) {
  return new Date(invite.expiresAt).getTime() <= now.getTime();
}

export function isVisiblePendingInvite(
  invite: Pick<typeof invites.$inferSelect, 'email' | 'clubId' | 'status' | 'expiresAt'>,
  userRows: Array<Pick<typeof users.$inferSelect, 'email' | 'clubId'>>,
  now = new Date(),
) {
  if (invite.status !== 'pending' || isInviteExpired(invite, now)) {
    return false;
  }

  const matchingUser = userRows.some((user) => invitationUserKey(user.email, user.clubId) === invitationUserKey(invite.email, invite.clubId));
  return !matchingUser;
}

async function findClubById(clubId: number) {
  const clubRows = await db.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
  const club = clubRows[0];
  if (!club) {
    throw new Error('Club not found.');
  }
  return club;
}

// The admin-entered `fullName` on an invite is an internal label, not the
// member's name (they enter their real first/last name when registering), so it
// is deliberately kept out of the email.
const ROLE_LABELS: Record<string, string> = {
  admin: 'administrator',
  coach: 'antrenor',
  staff: 'staff',
  player: 'jucător',
  parent: 'părinte',
  accountant: 'contabil',
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

function validityLabel(minutes: number) {
  const days = Math.round(minutes / (24 * 60));
  if (days >= 1 && minutes % (24 * 60) === 0) return days === 1 ? '24 de ore' : `${days} zile`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? 'o oră' : `${hours} ore`;
}

async function sendInviteEmail(params: { to: string; clubName: string; role: string; url: string; expiresAt: Date }) {
  if (!resend) {
    throw new Error('RESEND_API_KEY is missing.');
  }

  const expiresLabel = params.expiresAt.toLocaleString('ro-RO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Bucharest',
  });
  const club = escapeHtml(params.clubName);
  const role = escapeHtml(ROLE_LABELS[params.role] ?? params.role);
  const url = escapeHtml(params.url);
  const validity = validityLabel(INVITE_TTL_MINUTES);

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: params.to,
    subject: `Invitație în ${params.clubName}`,
    html: `
      <div style="margin:0;padding:0;background:#f3f4f6;font-family:Inter,Arial,sans-serif">
        <div style="max-width:640px;margin:0 auto;padding:32px 18px">
          <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;box-shadow:0 24px 70px rgba(17,24,39,.06)">
            <div style="display:inline-block;padding:8px 12px;border-radius:999px;background:#eef2ff;color:#4f46e5;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase">Invitație BCMS</div>
            <h1 style="margin:20px 0 12px;font-size:30px;line-height:1.1;color:#111827">Finalizează înregistrarea</h1>
            <p style="font-size:16px;line-height:1.7;color:#334155;margin:0 0 10px">Ai fost invitat(ă) în <strong>${club}</strong> cu rolul de <strong>${role}</strong>.</p>
            <p style="font-size:14px;line-height:1.7;color:#64748b;margin:0 0 10px">Invitația este valabilă ${validity} și poate fi folosită o singură dată.</p>
            <p style="font-size:13px;line-height:1.7;color:#64748b;margin:0 0 22px">Expiră pe ${escapeHtml(expiresLabel)}.</p>
            <p style="margin:0 0 18px">
              <a href="${url}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">Finalizează înregistrarea</a>
            </p>
            <p style="font-size:13px;color:#64748b;word-break:break-all;line-height:1.5;margin:0">${url}</p>
          </div>
        </div>
      </div>
    `,
    text: `Ai fost invitat(ă) în ${params.clubName} cu rolul de ${ROLE_LABELS[params.role] ?? params.role}. Invitația este valabilă ${validity} (până pe ${expiresLabel}) și poate fi folosită o singură dată. Finalizează înregistrarea: ${params.url}`,
  });
}

export async function createSuperAdminInvitation(
  input: SuperAdminInviteInput,
  actor: Pick<AuthenticatedRequest, 'user' | 'firebaseUser'> & { ip?: string; userAgent?: string } = {}
) {
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

  // The body is client input: never mint a superadmin (or a junk role) by invite.
  if (!INVITABLE_ROLES.has(role)) {
    throw new Error('Rol invalid pentru invitație.');
  }

  const club = await findClubById(clubId);

  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MINUTES * 60 * 1000);

  const inserted = await db.insert(invites).values({
    // Only the hash is kept (also in the legacy `token` column, which is NOT
    // NULL): the raw token lives in the emailed link and in this response.
    token: tokenHash,
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
    });
  } catch (error) {
    await db.update(invites).set({ status: 'revoked' }).where(eq(invites.id, invite.id));
    throw error;
  }

  await writeAuditLog({
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

export async function resendClubInvitation(
  params: { inviteId: number; clubId: number },
  actor: Pick<AuthenticatedRequest, 'user' | 'firebaseUser'> & { ip?: string; userAgent?: string } = {}
) {
  const rows = await db.select().from(invites)
    .where(and(eq(invites.id, params.inviteId), eq(invites.clubId, params.clubId)))
    .limit(1);

  const invite = rows[0];

  if (!invite) {
    throw new Error('Invitation not found.');
  }

  if (invite.status !== 'pending') {
    throw new Error('Only pending invitations can be resent.');
  }

  const club = await findClubById(invite.clubId ?? params.clubId);

  // Resending mints a fresh token + expiry on the same invite row, so any old
  // link stops working and the recipient gets a link that is valid again.
  const token = generateInviteToken();
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MINUTES * 60 * 1000);

  await db.update(invites).set({
    token: tokenHash,
    tokenHash,
    status: 'pending',
    expiresAt: expiresAt.toISOString(),
  }).where(eq(invites.id, invite.id));

  const inviteUrl = buildInviteUrl(token);

  try {
    await sendInviteEmail({
      to: invite.email,
      clubName: club.name,
      role: invite.role,
      url: inviteUrl,
      expiresAt,
    });
  } catch (error) {
    await db.update(invites).set({ status: 'revoked' }).where(eq(invites.id, invite.id));
    throw error;
  }

  await writeAuditLog({
    action: 'invitation.resent',
    entityType: 'invitation',
    entityId: invite.id,
    actorUserId: actor.user?.id ?? null,
    actorUid: actor.firebaseUser?.uid ?? null,
    actorRole: actor.user?.role ?? actor.firebaseUser?.role ?? null,
    clubId: club.id,
    metadata: { email: invite.email, role: invite.role, clubId: club.id, clubName: club.name },
    ipAddress: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    clubId: club.id,
    clubName: club.name,
    status: 'pending',
    expiresAt: expiresAt.toISOString(),
    inviteUrl,
  };
}

export const INVITATION_ERRORS = {
  notFound: 'Invitația nu există.',
  noEmail: 'Contul tău nu are o adresă de email verificată. Verifică emailul și încearcă din nou.',
  wrongEmail: 'Invitația este pentru o altă adresă de email.',
  revoked: 'Invitația a fost anulată.',
  expired: 'Invitația a expirat. Cere una nouă.',
  used: 'Invitația a fost deja folosită.',
  otherAccount: 'Există deja un cont pentru acest email. Autentifică-te cu el.',
} as const;

/**
 * Reads one invitation by its token. Read-only: the public signup page calls
 * this without a session, so it must never write (expiry is computed here,
 * not stored) nor scan anything beyond the requested invite.
 */
export async function validateInvitationToken(token: string) {
  const tokenHash = hashInviteToken(token);
  const rows = await db.select({
    id: invites.id,
    email: invites.email,
    role: invites.role,
    clubId: invites.clubId,
    status: invites.status,
    expiresAt: invites.expiresAt,
    createdAt: invites.createdAt,
    usedAt: invites.usedAt,
    usedBy: invites.usedBy,
    clubName: clubs.name,
  }).from(invites).leftJoin(clubs, eq(invites.clubId, clubs.id)).where(eq(invites.tokenHash, tokenHash)).limit(1);

  const invite = rows[0];
  if (!invite) {
    return null;
  }

  const isExpired = invite.status === 'expired' || (invite.status === 'pending' && isInviteExpired(invite));
  const status = isExpired ? 'expired' : invite.status;
  // Single use: only a pending, unexpired invitation can still be accepted.
  const canAccept = status === 'pending';

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    clubId: invite.clubId,
    clubName: invite.clubName ?? null,
    status,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    usedAt: invite.usedAt,
    usedBy: invite.usedBy,
    isExpired,
    canAccept,
    message: isExpired
      ? INVITATION_ERRORS.expired
      : status === 'revoked'
        ? INVITATION_ERRORS.revoked
        : status === 'accepted'
          ? INVITATION_ERRORS.used
          : null,
  };
}

/**
 * Accepts an email invitation for the signed-in caller.
 *
 * `email` MUST be the caller's verified identity email (never request input):
 * the invitation is bound to one address. The invite is claimed atomically
 * (pending → accepted in one guarded UPDATE), so a link works exactly once,
 * and an existing account bound to another sign-in is never re-pointed at the
 * caller (lib/identityLink.ts).
 */
export async function acceptInvitation(params: {
  token: string;
  firebaseUid: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
}) {
  if (!params.firebaseUid) {
    throw new Error(INVITATION_ERRORS.notFound);
  }
  const email = normalizeEmail(params.email ?? '');
  if (!email) {
    throw new Error(INVITATION_ERRORS.noEmail);
  }

  const tokenHash = hashInviteToken(params.token);
  const inviteRows = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash)).limit(1);
  const invite = inviteRows[0];

  if (!invite) {
    throw new Error(INVITATION_ERRORS.notFound);
  }

  if (email !== normalizeEmail(invite.email)) {
    throw new Error(INVITATION_ERRORS.wrongEmail);
  }

  if (invite.status === 'revoked') {
    throw new Error(INVITATION_ERRORS.revoked);
  }

  if (invite.status === 'accepted') {
    throw new Error(INVITATION_ERRORS.used);
  }

  if (invite.status === 'expired' || isInviteExpired(invite)) {
    throw new Error(INVITATION_ERRORS.expired);
  }

  const [ownRows, emailRows] = await Promise.all([
    db.select().from(users).where(or(eq(users.firebaseUid, params.firebaseUid), eq(users.uid, params.firebaseUid))).limit(1),
    db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1),
  ]);
  const own = ownRows[0];
  const byEmail = emailRows[0];

  // The invited address already has an account: it must be the caller's own,
  // or one nobody signs in to yet. Never someone else's.
  if (byEmail && (own ? byEmail.id !== own.id : !canLinkToUid(byEmail, params.firebaseUid))) {
    throw new Error(INVITATION_ERRORS.otherAccount);
  }
  const existing = own ?? byEmail ?? null;

  const displayName = [params.firstName, params.lastName].filter(Boolean).join(' ').trim() || email.split('@')[0] || 'New User';
  const firstName = params.firstName?.trim() || null;
  const lastName = params.lastName?.trim() || null;
  const nowIso = new Date().toISOString();

  const userId = await db.transaction(async (tx) => {
    // Claim first: of two concurrent accepts only one gets the row back, and
    // the loser's transaction writes nothing.
    const claimed = await tx.update(invites)
      .set({ status: 'accepted', usedAt: nowIso })
      .where(and(eq(invites.id, invite.id), eq(invites.status, 'pending'), gt(invites.expiresAt, nowIso)))
      .returning({ id: invites.id });
    if (!claimed[0]) {
      throw new Error(INVITATION_ERRORS.used);
    }

    const account = {
      firebaseUid: params.firebaseUid,
      email,
      name: displayName,
      firstName,
      lastName,
      role: invite.role as typeof users.$inferInsert['role'],
      status: 'active' as const,
      clubId: invite.clubId,
      phone: params.phone ?? null,
    };

    let id: number;
    if (existing) {
      const updated = await tx.update(users).set({ ...account, updatedAt: nowIso })
        .where(and(
          eq(users.id, existing.id),
          // Same guard as the read above, against a sign-in linking the row meanwhile.
          existing.firebaseUid ? eq(users.firebaseUid, existing.firebaseUid) : isNull(users.firebaseUid),
        ))
        .returning({ id: users.id });
      if (!updated[0]) {
        throw new Error(INVITATION_ERRORS.otherAccount);
      }
      id = updated[0].id;
    } else {
      const inserted = await tx.insert(users).values(account).returning({ id: users.id });
      id = inserted[0].id;
    }

    await tx.update(invites).set({ usedBy: id }).where(eq(invites.id, invite.id));
    return id;
  });

  await writeAuditLog({
    action: 'invitation.accepted',
    entityType: 'invitation',
    entityId: invite.id,
    actorUserId: userId,
    actorUid: params.firebaseUid,
    actorRole: invite.role,
    clubId: invite.clubId ?? null,
    metadata: { email, role: invite.role, clubId: invite.clubId, existingAccount: Boolean(existing) },
  });

  return {
    userId,
    clubId: invite.clubId,
    role: invite.role,
    status: 'active',
  };
}

export async function completeUserRegistration(params: {
  firebaseUid: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  avatarUrl?: string | null;
}) {
  const rows = await db.select().from(users).where(eq(users.firebaseUid, params.firebaseUid)).limit(1);
  const user = rows[0];

  if (!user) {
    throw new Error('User not found.');
  }

  const name = `${params.firstName.trim()} ${params.lastName.trim()}`.trim();
  const updated = await db.update(users).set({
    name,
    firstName: params.firstName.trim(),
    lastName: params.lastName.trim(),
    phone: params.phone ?? user.phone ?? null,
    avatarUrl: params.avatarUrl ?? user.avatarUrl ?? null,
    // Profile details only. This used to set status 'active' for any caller,
    // so an account still waiting for the club's approval could approve
    // itself. Activation happens where the club approves (or the invite flow).
    updatedAt: new Date().toISOString(),
  }).where(eq(users.id, user.id)).returning();

  await writeAuditLog({
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

  return publicUser(updated[0]);
}

export async function listInvitations() {
  const rows = await db.select({
    id: invites.id,
    email: invites.email,
    role: invites.role,
    clubId: invites.clubId,
    status: invites.status,
    expiresAt: invites.expiresAt,
    createdAt: invites.createdAt,
    usedAt: invites.usedAt,
    usedBy: invites.usedBy,
    clubName: clubs.name,
  }).from(invites).leftJoin(clubs, eq(invites.clubId, clubs.id)).orderBy(desc(invites.createdAt));

  // Expiry is computed on read (nothing rewrites invites in the background).
  const now = new Date();
  return rows.map((row) => ({
    ...row,
    status: row.status === 'pending' && isInviteExpired(row, now) ? 'expired' : row.status,
    clubName: row.clubName ?? null,
  }));
}

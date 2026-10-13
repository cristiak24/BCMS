import { Router } from 'express';
import { db } from '../db';
import { users, clubs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { authenticate, requireSuperadmin, AuthenticatedRequest } from '../middleware/auth';
import { createSuperAdminInvitation } from '../services/invitationsService';
import { loadServerEnv } from '../lib/loadEnv';
import { clientIp, rateLimit } from '../middleware/rateLimit';
import { loadOwnRequests } from '../lib/accessNotify';
import { resolveSelfPlayerForRequest, teamIdsOfPlayers } from '../lib/selfPlayer';
import { describeInvite, resolveInvite } from '../lib/inviteResolver';
import { completeInviteSignup } from '../lib/inviteSignup';

const router = Router();
loadServerEnv();

// Public, unauthenticated: throttles guessing short invite codes. Per client IP
// (see clientIp), so a whole team signing up from one gym wifi needs headroom.
const inviteValidateLimiter = rateLimit({ bucket: 'auth:invite-validate', limit: 30, windowMs: 60_000 });
// Signup redeems codes too: cap per Clerk identity and, more loosely, per IP.
const signupIpLimiter = rateLimit({ bucket: 'auth:signup-ip', limit: 60, windowMs: 60_000, key: (req) => `ip:${clientIp(req)}` });
const signupUidLimiter = rateLimit({
    bucket: 'auth:signup',
    limit: 10,
    windowMs: 60_000,
    key: (req) => (req.firebaseUser?.uid ? `uid:${req.firebaseUser.uid}` : null),
});

async function findClubName(clubId?: number | null) {
    if (clubId == null) {
        return null;
    }
    const clubRows = await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
    return clubRows[0]?.name ?? null;
}

/** Teams of the caller's player record — for a parent, their selected child's. */
async function findSelfTeamIds(req: AuthenticatedRequest) {
    const player = await resolveSelfPlayerForRequest(req);
    return player ? (await teamIdsOfPlayers([player.id])).map(String) : [];
}

function buildAuthUser(user: typeof users.$inferSelect, clubName: string | null, teamIds: string[]) {
    return {
        id: user.id,
        uid: user.firebaseUid ?? user.uid ?? '',
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        clubId: user.clubId,
        status: user.status,
        clubName,
        teamIds,
        avatarUrl: user.avatarUrl,
        photoURL: user.avatarUrl,
        phone: user.phone,
        preferredLanguage: user.preferredLanguage,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
    };
}

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: any) => {
    try {
        if (!req.user) {
            return res.status(404).json({ error: 'User profile not found' });
        }

        const user = req.user;
        const [clubName, teamIds] = await Promise.all([findClubName(user.clubId), findSelfTeamIds(req)]);

        res.json({
            success: true,
            user: buildAuthUser(user, clubName, teamIds),
        });
    } catch (error) {
        console.error('Error fetching /me:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/auth/my-requests
// What the waiting screen shows: the caller's own requests and whether every
// one of them was turned down. Open to pending accounts (they only see theirs).
router.get('/my-requests', authenticate, async (req: AuthenticatedRequest, res: any) => {
    try {
        if (!req.user) {
            return res.status(404).json({ error: 'User profile not found' });
        }
        res.json(await loadOwnRequests(req.user.id));
    } catch (error) {
        console.error('Error fetching /my-requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/complete-signup
// Public self-signup is closed: the role (and club) must come from an invite
// created by a club admin, so it goes through /complete-invite-signup. This
// route used to let anyone pick "coach" and land active in a default club.
router.post('/complete-signup', authenticate, async (_req: AuthenticatedRequest, res: any) => {
    res.status(403).json({ error: 'Ai nevoie de un cod de invitație de la administratorul clubului pentru a-ți crea cont.' });
});

// POST /api/auth/superadmin/create-admin-invite
router.post('/superadmin/create-admin-invite', authenticate, requireSuperadmin, async (req: AuthenticatedRequest, res: any) => {
    try {
        const result = await createSuperAdminInvitation({
            email: String(req.body?.email ?? ''),
            role: 'admin',
            clubId: Number(req.body?.clubId),
        }, {
            user: req.user,
            firebaseUser: req.firebaseUser,
            ip: req.ip,
            userAgent: req.get('user-agent') ?? undefined,
        });

        res.status(201).json({
            success: true,
            invitation: result,
            message: 'Invite created successfully.'
        });
    } catch (error) {
        console.error('Create invite error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(400).json({ error: message });
    }
});

// GET /api/auth/invites/validate
router.get('/invites/validate', inviteValidateLimiter as any, async (req: any, res: any) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token is required' });

        const found = await resolveInvite(String(token));
        if (!found.ok) return res.status(404).json({ error: found.error });

        const summary = describeInvite(found.invite);
        if (!summary) return res.status(400).json({ error: 'Invite expired' });
        return res.json({ success: true, ...summary });
    } catch (error) {
        console.error('Validate invite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/complete-invite-signup
router.post('/complete-invite-signup', signupIpLimiter, authenticate, signupUidLimiter, async (req: AuthenticatedRequest, res: any) => {
    try {
        const outcome = await completeInviteSignup({
            body: req.body,
            identity: { uid: req.firebaseUser.uid, email: req.firebaseUser.email || '' },
            existingUser: req.user ? { id: req.user.id, status: req.user.status } : null,
            ip: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
        });
        res.status(outcome.status).json(outcome.body);
    } catch (error) {
        console.error('Complete invite signup error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(400).json({ error: message });
    }
});

export default router;

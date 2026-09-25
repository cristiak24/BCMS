import { Router } from 'express';
import { db } from '../db';
import { users, clubs, players, playersToTeams } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ensureDefaultClub } from '../lib/manageAccessRepository';
import { splitDisplayName } from '../lib/password';
import { authenticate, requireSuperadmin, AuthenticatedRequest } from '../middleware/auth';
import { acceptInvitation, createSuperAdminInvitation, validateInvitationToken } from '../services/invitationsService';
import { createPendingAccessRequestForSignup, validateInviteToken } from '../lib/manageAccessService';
import { loadServerEnv } from '../lib/loadEnv';

const router = Router();
loadServerEnv();

async function findClubName(clubId?: number | null) {
    if (clubId == null) {
        return null;
    }
    const clubRows = await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
    return clubRows[0]?.name ?? null;
}

async function findPlayerTeamIdsByEmail(email?: string | null) {
    if (!email) {
        return [];
    }

    const playerRows = await db.select().from(players).where(eq(players.email, email)).limit(1);
    const player = playerRows[0];
    if (!player) {
        return [];
    }

    const ids = new Set<number>();
    if (player.teamId != null) {
        ids.add(player.teamId);
    }

    const relationRows = await db
        .select({ teamId: playersToTeams.teamId })
        .from(playersToTeams)
        .where(eq(playersToTeams.playerId, player.id));

    relationRows.forEach((row) => ids.add(row.teamId));
    return Array.from(ids).map(String);
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
        const clubName = await findClubName(user.clubId);
        const teamIds = await findPlayerTeamIdsByEmail(user.email);

        res.json({
            success: true,
            user: buildAuthUser(user, clubName, teamIds),
        });
    } catch (error) {
        console.error('Error fetching /me:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/complete-signup
router.post('/complete-signup', authenticate, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { name, role } = req.body;
        const firebaseUser = req.firebaseUser;

        if (!name || !role) {
            return res.status(400).json({ error: 'Name and role are required' });
        }

        if (role !== 'player' && role !== 'coach' && role !== 'parent') {
            return res.status(400).json({ error: 'Invalid role for public signup' });
        }

        if (req.user) {
            return res.status(409).json({ error: 'User already exists' });
        }

        const { firstName, lastName } = splitDisplayName(name);
        const defaultClub = await ensureDefaultClub();

        const insertResult = await db.insert(users).values({
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name,
            firstName,
            lastName,
            role,
            status: 'active',
            clubId: defaultClub.id,
        }).returning();

        const newUser = insertResult[0];

        res.status(201).json({
            success: true,
            user: newUser
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
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
router.get('/invites/validate', async (req: any, res: any) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token is required' });

        const rawToken = String(token);
        const invitation = await validateInvitationToken(rawToken);
        if (invitation) {
            if (invitation.isExpired || invitation.status !== 'pending') {
                return res.status(400).json({ error: 'Invite expired' });
            }
            return res.json({ success: true, source: 'invitation', ...invitation });
        }

        try {
            const manageAccessInvite = await validateInviteToken(rawToken);
            return res.json({
                success: true,
                source: 'manage-access',
                email: null,
                status: 'pending',
                canAccept: true,
                message: null,
                ...manageAccessInvite,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Invite not found or already used/expired';
            return res.status(404).json({ error: message });
        }
    } catch (error) {
        console.error('Validate invite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auth/complete-invite-signup
router.post('/complete-invite-signup', authenticate, async (req: AuthenticatedRequest, res: any) => {
    try {
        const { name, inviteToken } = req.body;
        const firebaseUser = req.firebaseUser;

        if (!name || !inviteToken) {
            return res.status(400).json({ error: 'Name and invite token are required' });
        }

        const { firstName, lastName } = splitDisplayName(name);
        let result;
        const classicInvitation = await validateInvitationToken(String(inviteToken));

        if (classicInvitation) {
            result = await acceptInvitation({
                token: inviteToken,
                firebaseUid: firebaseUser.uid,
                email: firebaseUser.email || '',
                firstName,
                lastName,
            });
        } else {
            const manageAccessInvite = await validateInviteToken(String(inviteToken));
            let userRecord = req.user;

            if (!userRecord) {
                const inserted = await db.insert(users).values({
                    firebaseUid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    name,
                    firstName,
                    lastName,
                    role: manageAccessInvite.role as any,
                    status: 'pending',
                    clubId: manageAccessInvite.clubId,
                }).returning();
                userRecord = inserted[0];
            } else {
                const updated = await db.update(users).set({
                    firebaseUid: firebaseUser.uid,
                    email: firebaseUser.email || '',
                    name,
                    firstName,
                    lastName,
                    role: manageAccessInvite.role as any,
                    status: 'pending',
                    clubId: manageAccessInvite.clubId,
                    updatedAt: new Date().toISOString(),
                }).where(eq(users.id, req.user.id)).returning();
                userRecord = updated[0];
            }

            await createPendingAccessRequestForSignup({
                userId: userRecord.id,
                clubId: manageAccessInvite.clubId,
                role: manageAccessInvite.role as 'player' | 'parent' | 'coach',
            });

            result = {
                userId: userRecord.id,
                clubId: manageAccessInvite.clubId,
                role: manageAccessInvite.role,
                status: 'pending',
            };
        }

        res.status(201).json({
            success: true,
            user: result
        });
    } catch (error) {
        console.error('Complete invite signup error:', error);
        const message = error instanceof Error ? error.message : 'Internal server error';
        res.status(400).json({ error: message });
    }
});

export default router;

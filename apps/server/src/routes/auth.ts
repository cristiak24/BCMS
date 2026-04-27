import { Router } from 'express';
import { db } from '../db';
import { users, clubs, invites } from '../db/schema';
import { eq, or, and } from 'drizzle-orm';
import { ensureDefaultClub } from '../lib/manageAccessRepository';
import { splitDisplayName } from '../lib/password';
import { authenticate, requireSuperadmin, AuthenticatedRequest } from '../middleware/auth';
import crypto from 'crypto';
import { acceptInvitation, createSuperAdminInvitation, validateInvitationToken } from '../services/invitationsService';

const router = Router();

async function findClubName(clubId?: number | null) {
    if (clubId == null) {
        return null;
    }
    const clubRows = await db.select({ name: clubs.name }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
    return clubRows[0]?.name ?? null;
}

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: any) => {
    try {
        if (!req.user) {
            return res.status(404).json({ error: 'User profile not found' });
        }

        const user = req.user;
        const clubName = await findClubName(user.clubId);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                clubId: user.clubId,
                status: user.status,
                clubName,
                avatarUrl: user.avatarUrl,
                phone: user.phone,
                preferredLanguage: user.preferredLanguage,
                createdAt: user.createdAt,
                lastLoginAt: user.lastLoginAt,
            }
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
        const invitation = await validateInvitationToken(String(token));
        if (!invitation) {
            return res.status(404).json({ error: 'Invite not found or already used/expired' });
        }
        if (invitation.isExpired || invitation.status !== 'pending') {
            return res.status(400).json({ error: 'Invite expired' });
        }
        res.json({ success: true, ...invitation });
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
        const result = await acceptInvitation({
            token: inviteToken,
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email || '',
            firstName,
            lastName,
        });
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

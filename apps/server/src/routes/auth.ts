import { Router } from 'express';
import { db } from '../db';
import { users, clubs, invites } from '../db/schema';
import { eq, or, and } from 'drizzle-orm';
import { ensureDefaultClub } from '../lib/manageAccessRepository';
import { splitDisplayName } from '../lib/password';
import { authenticate, requireSuperadmin, AuthenticatedRequest } from '../middleware/auth';
import crypto from 'crypto';

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
        const { email, clubName } = req.body;

        if (!email || !clubName) {
            return res.status(400).json({ error: 'Email and club name are required' });
        }

        // Ensure club exists
        const normalizedName = clubName.trim().toLowerCase();
        let clubRows = await db.select().from(clubs).where(eq(clubs.normalizedName, normalizedName)).limit(1);
        let clubId: number;

        if (clubRows.length === 0) {
            const inserted = await db.insert(clubs).values({
                name: clubName.trim(),
                normalizedName,
                createdBy: req.user.id.toString(),
            }).returning();
            clubId = inserted[0].id;
        } else {
            clubId = clubRows[0].id;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

        await db.insert(invites).values({
            email,
            role: 'admin',
            clubId,
            tokenHash,
            status: 'active',
            expiresAt: expiresAt.toISOString(),
            createdBy: req.user.id,
        });

        res.json({
            success: true,
            inviteToken: token,
            message: 'Invite created successfully.'
        });
    } catch (error) {
        console.error('Create invite error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/auth/invites/validate
router.get('/invites/validate', async (req: any, res: any) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token is required' });

        const tokenHash = crypto.createHash('sha256').update(token as string).digest('hex');
        
        const inviteRows = await db.select().from(invites).where(
            and(
                eq(invites.tokenHash, tokenHash),
                eq(invites.status, 'active')
            )
        ).limit(1);

        const invite = inviteRows[0];

        if (!invite) {
            return res.status(404).json({ error: 'Invite not found or already used/expired' });
        }

        if (new Date(invite.expiresAt) < new Date()) {
            await db.update(invites).set({ status: 'expired' }).where(eq(invites.id, invite.id));
            return res.status(400).json({ error: 'Invite expired' });
        }

        const clubName = await findClubName(invite.clubId);

        res.json({
            success: true,
            email: invite.email,
            role: invite.role,
            clubId: invite.clubId,
            clubName
        });
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

        const tokenHash = crypto.createHash('sha256').update(inviteToken).digest('hex');
        const inviteRows = await db.select().from(invites).where(
            and(
                eq(invites.tokenHash, tokenHash),
                eq(invites.status, 'active')
            )
        ).limit(1);

        const invite = inviteRows[0];

        if (!invite || new Date(invite.expiresAt) < new Date()) {
            return res.status(400).json({ error: 'Invite is invalid or expired' });
        }

        if (req.user) {
            return res.status(409).json({ error: 'User already exists' });
        }

        const { firstName, lastName } = splitDisplayName(name);

        const insertResult = await db.insert(users).values({
            firebaseUid: firebaseUser.uid,
            email: firebaseUser.email || invite.email,
            name,
            firstName,
            lastName,
            role: invite.role,
            status: 'active',
            clubId: invite.clubId,
        }).returning();

        const newUser = insertResult[0];

        await db.update(invites).set({ 
            status: 'used', 
            usedBy: newUser.id,
            usedAt: new Date().toISOString()
        }).where(eq(invites.id, invite.id));

        res.status(201).json({
            success: true,
            user: newUser
        });
    } catch (error) {
        console.error('Complete invite signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;

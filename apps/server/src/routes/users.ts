import { Router } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, asc } from 'drizzle-orm';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

async function listUsers() {
    const rows = await db.select().from(users).orderBy(asc(users.id));
    return rows;
}

async function findUserByNumericId(id: number) {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? undefined;
}

async function findUserByUid(uid: string) {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] ?? undefined;
}

router.use(authenticate);

// GET /api/users/me
router.get('/me', async (req: AuthenticatedRequest, res) => {
    try {
        const uid = req.firebaseUser?.uid;
        const user = req.user ?? (uid ? await findUserByUid(uid) : null);

        if (!user) {
            return res.status(404).json({ error: 'User profile not found' });
        }

        res.json({
            id: user.id,
            uid: user.uid,
            email: user.email,
            name: user.name,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            clubId: user.clubId,
            status: user.status,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

// GET /api/users
router.get('/', requireRoles(['admin']), async (_req, res) => {
    try {
        const allUsers = await listUsers();
        res.json(allUsers.map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        })));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// GET /api/users/:id
router.get('/:id', requireRoles(['admin']), async (req, res) => {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }

    try {
        const user = await findUserByNumericId(id);

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// PATCH /api/users/:id
router.patch('/:id', requireRoles(['admin']), async (req, res) => {
    const id = Number(req.params.id);
    const { name, role } = req.body as { name?: string; role?: string };

    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }

    try {
        const user = await findUserByNumericId(id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const nextUser = {
            ...(typeof name === 'string' ? { name } : {}),
            ...(typeof role === 'string' ? { role: role as any } : {}),
        };

        const updatedRows = await db.update(users).set(nextUser).where(eq(users.id, user.id)).returning();
        const updatedUser = updatedRows[0];

        res.json({
            id: updatedUser.id,
            email: updatedUser.email,
            name: updatedUser.name,
            role: updatedUser.role,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

export default router;

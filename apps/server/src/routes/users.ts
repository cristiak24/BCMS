import { Router } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { eq, asc, and } from 'drizzle-orm';
import { authenticate, requireRoles, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * Roles a club admin is allowed to assign. Granting `admin` or `superadmin` is
 * reserved for a superadmin: otherwise any club admin could promote themselves
 * (or a colleague) to full platform access through this endpoint.
 */
const ADMIN_ASSIGNABLE_ROLES = new Set(['player', 'parent', 'coach', 'staff', 'accountant']);
const SUPERADMIN_ASSIGNABLE_ROLES = new Set([...ADMIN_ASSIGNABLE_ROLES, 'admin', 'superadmin']);

function isSuperadmin(req: AuthenticatedRequest) {
    return req.user?.role === 'superadmin';
}

function getRequestClubId(req: AuthenticatedRequest) {
    return req.user?.clubId == null ? null : Number(req.user.clubId);
}

async function findUserByUid(uid: string) {
    const rows = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    return rows[0] ?? undefined;
}

/**
 * Load a user the caller is actually allowed to see.
 *
 * A club admin may only reach accounts inside their own club. Previously every
 * handler here loaded users by raw id with no club check, so a club admin could
 * read — and rewrite — any account on the platform, including the superadmin's.
 */
async function findAccessibleUser(req: AuthenticatedRequest, id: number) {
    if (isSuperadmin(req)) {
        const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return rows[0] ?? undefined;
    }

    const clubId = getRequestClubId(req);
    if (clubId == null) {
        return undefined;
    }

    const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.clubId, clubId)))
        .limit(1);

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
router.get('/', requireRoles(['admin']), async (req: AuthenticatedRequest, res) => {
    try {
        const clubId = getRequestClubId(req);

        if (!isSuperadmin(req) && clubId == null) {
            return res.status(403).json({ error: 'Your account is not assigned to a club.' });
        }

        // Scope the query in SQL rather than fetching every row and filtering.
        const rows = isSuperadmin(req)
            ? await db.select().from(users).orderBy(asc(users.id))
            : await db.select().from(users).where(eq(users.clubId, clubId!)).orderBy(asc(users.id));

        res.json(rows.map((user) => ({
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
router.get('/:id', requireRoles(['admin']), async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }

    try {
        const user = await findAccessibleUser(req, id);

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
router.patch('/:id', requireRoles(['admin']), async (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    const { name, role } = req.body as { name?: string; role?: string };

    if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid user id' });
        return;
    }

    try {
        const user = await findAccessibleUser(req, id);
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        if (role !== undefined) {
            if (typeof role !== 'string') {
                res.status(400).json({ error: 'role must be a string.' });
                return;
            }

            const assignable = isSuperadmin(req) ? SUPERADMIN_ASSIGNABLE_ROLES : ADMIN_ASSIGNABLE_ROLES;
            if (!assignable.has(role)) {
                res.status(403).json({ error: 'You are not allowed to assign this role.' });
                return;
            }

            // A club admin must not be able to demote or re-role an existing
            // admin/superadmin account, only manage ordinary club members.
            if (!isSuperadmin(req) && (user.role === 'admin' || user.role === 'superadmin')) {
                res.status(403).json({ error: 'You are not allowed to change the role of an administrator.' });
                return;
            }

            // Nobody changes their own role through this endpoint.
            if (user.id === req.user?.id) {
                res.status(403).json({ error: 'You cannot change your own role.' });
                return;
            }
        }

        if (name !== undefined && typeof name !== 'string') {
            res.status(400).json({ error: 'name must be a string.' });
            return;
        }

        const trimmedName = typeof name === 'string' ? name.trim() : undefined;
        if (trimmedName !== undefined && (trimmedName.length === 0 || trimmedName.length > 120)) {
            res.status(400).json({ error: 'name must be between 1 and 120 characters.' });
            return;
        }

        const nextUser = {
            ...(trimmedName !== undefined ? { name: trimmedName } : {}),
            ...(typeof role === 'string' ? { role: role as any } : {}),
        };

        if (Object.keys(nextUser).length === 0) {
            res.status(400).json({ error: 'No updatable fields were provided.' });
            return;
        }

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

import { Router } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/users
router.get('/', async (req, res) => {
    try {
        const allUsers = await db.select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
        }).from(users);
        res.json(allUsers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const user = await db.select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
        })
            .from(users)
            .where(eq(users.id, Number(id)))
            .limit(1);

        if (user.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(user[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// PATCH /api/users/:id
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, role } = req.body;

    try {
        const updated = await db
            .update(users)
            .set({ name, role })
            .where(eq(users.id, Number(id)))
            .returning({
                id: users.id,
                email: users.email,
                name: users.name,
                role: users.role,
            });

        if (updated.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json(updated[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

export default router;

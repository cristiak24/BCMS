import { Router } from 'express';
import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/admin/requests
// Get all users with status 'pending'
router.get('/requests', async (req, res) => {
    try {
        const pendingUsers = await db.select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status,
        })
            .from(users)
            .where(eq(users.status, 'pending'));

        res.json(pendingUsers);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
});

// POST /api/admin/requests/:id/approve
// Approve a user: Set status to 'processed' and assign a role
router.post('/requests/:id/approve', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body; // Admin selects the role

    if (!role) {
        return res.status(400).json({ error: 'Role is required for approval' });
    }

    try {
        const updated = await db
            .update(users)
            .set({
                status: 'processed',
                role: role // 'admin', 'coach', 'accountant'
            })
            .where(eq(users.id, Number(id)))
            .returning({
                id: users.id,
                email: users.email,
                name: users.name,
                role: users.role,
                status: users.status
            });

        if (updated.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, user: updated[0] });
    } catch (error) {
        console.error('Error approving user:', error);
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

// POST /api/admin/requests/:id/reject
// Reject a user: Set status to 'rejected' (or delete?)
router.post('/requests/:id/reject', async (req, res) => {
    const { id } = req.params;

    try {
        const updated = await db
            .update(users)
            .set({ status: 'rejected' })
            .where(eq(users.id, Number(id)))
            .returning();

        if (updated.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ success: true, message: 'User rejected' });
    } catch (error) {
        console.error('Error rejecting user:', error);
        res.status(500).json({ error: 'Failed to reject user' });
    }
});

export default router;

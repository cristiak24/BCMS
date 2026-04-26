import { Router } from 'express';
import { firestore } from '../lib/firebaseAdmin';

type UserDoc = {
    id: number;
    email: string;
    name: string;
    role: string;
    status: string;
};

const router = Router();

router.get('/requests', async (_req, res) => {
    try {
        const pendingUsersSnap = await firestore.collection('users').where('status', '==', 'pending').get();
        const pendingUsers = pendingUsersSnap.docs.map((docSnap) => docSnap.data() as UserDoc).map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.status,
        }));

        res.json(pendingUsers);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
});

router.post('/requests/:id/approve', async (req, res) => {
    const id = Number(req.params.id);
    const { role } = req.body as { role?: string };

    if (!role) {
        return res.status(400).json({ error: 'Role is required for approval' });
    }

    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }

    try {
        const snap = await firestore.collection('users').where('id', '==', id).limit(1).get();
        const docSnap = snap.docs[0];

        if (!docSnap) {
            return res.status(404).json({ error: 'User not found' });
        }

        const current = docSnap.data() as UserDoc;
        const nextUser = {
            ...current,
            status: 'processed',
            role,
        };

        await docSnap.ref.set(nextUser, { merge: true });
        res.json({ success: true, user: nextUser });
    } catch (error) {
        console.error('Error approving user:', error);
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

router.post('/requests/:id/reject', async (req, res) => {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid user id' });
    }

    try {
        const snap = await firestore.collection('users').where('id', '==', id).limit(1).get();
        const docSnap = snap.docs[0];

        if (!docSnap) {
            return res.status(404).json({ error: 'User not found' });
        }

        const current = docSnap.data() as UserDoc;
        await docSnap.ref.set({ ...current, status: 'rejected' }, { merge: true });

        res.json({ success: true, message: 'User rejected' });
    } catch (error) {
        console.error('Error rejecting user:', error);
        res.status(500).json({ error: 'Failed to reject user' });
    }
});

export default router;

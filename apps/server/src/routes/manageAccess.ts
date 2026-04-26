import { Router } from 'express';
import { requireClubAdmin } from '../lib/requestContext';
import {
    approveManageAccessRequest,
    denyManageAccessRequest,
    generateClubInviteLink,
    getActiveClubInviteLink,
    listManageAccessRequests,
} from '../lib/manageAccessService';
import type { InviteRole } from '../types/manageAccess';

const router = Router();

function readInviteRole(value: unknown): InviteRole | null {
    return value === 'player' || value === 'parent' || value === 'coach' ? value : null;
}

router.get('/requests', async (req, res) => {
    const user = await requireClubAdmin(req, res);

    if (!user) {
        return;
    }

    try {
        const requests = await listManageAccessRequests(user);
        res.json(requests);
    } catch (error) {
        console.error('Failed to list access requests:', error);
        res.status(500).json({ error: 'Could not load access requests.' });
    }
});

router.post('/requests/:id/approve', async (req, res) => {
    const user = await requireClubAdmin(req, res);

    if (!user) {
        return;
    }

    try {
        await approveManageAccessRequest(user, Number(req.params.id));
        res.status(204).end();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not approve the request.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
});

router.post('/requests/:id/deny', async (req, res) => {
    const user = await requireClubAdmin(req, res);

    if (!user) {
        return;
    }

    try {
        await denyManageAccessRequest(user, Number(req.params.id));
        res.status(204).end();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not deny the request.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
});

router.get('/invite-links/active', async (req, res) => {
    const user = await requireClubAdmin(req, res);

    if (!user) {
        return;
    }

    const role = readInviteRole(req.query.role);
    if (!role) {
        res.status(400).json({ error: 'A valid role is required.' });
        return;
    }

    try {
        const inviteLink = await getActiveClubInviteLink(user, role);
        res.json(inviteLink);
    } catch (error) {
        console.error('Failed to load active invite link:', error);
        res.status(500).json({ error: 'Could not load the invite link.' });
    }
});

router.post('/invite-links/generate', async (req, res) => {
    const user = await requireClubAdmin(req, res);

    if (!user) {
        return;
    }

    const role = readInviteRole(req.body?.role);
    if (!role) {
        res.status(400).json({ error: 'A valid role is required.' });
        return;
    }

    try {
        const inviteLink = await generateClubInviteLink(user, role, Number(req.body?.refreshIntervalMinutes));
        res.status(201).json(inviteLink);
    } catch (error) {
        console.error('Failed to generate invite link:', error);
        res.status(500).json({ error: 'Could not generate the invite link.' });
    }
});

export default router;

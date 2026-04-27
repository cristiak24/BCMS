"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const invitationsService_1 = require("../services/invitationsService");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, auth_1.requireSuperadmin, async (_req, res) => {
    try {
        const invitations = await (0, invitationsService_1.listInvitations)();
        res.json({ success: true, invitations });
    }
    catch (error) {
        console.error('List invitations error:', error);
        res.status(500).json({ error: 'Could not load invitations.' });
    }
});
router.post('/', auth_1.authenticate, auth_1.requireSuperadmin, async (req, res) => {
    try {
        const result = await (0, invitationsService_1.createSuperAdminInvitation)({
            email: String(req.body?.email ?? ''),
            fullName: String(req.body?.fullName ?? ''),
            role: req.body?.role,
            clubId: Number(req.body?.clubId),
        }, {
            user: req.user,
            firebaseUser: req.firebaseUser,
            ip: req.ip,
            userAgent: req.get('user-agent') ?? undefined,
        });
        res.status(201).json({ success: true, invitation: result });
    }
    catch (error) {
        console.error('Create invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not create invitation.';
        res.status(400).json({ error: message });
    }
});
router.get('/:token', async (req, res) => {
    try {
        const token = String(req.params.token ?? '').trim();
        if (!token) {
            return res.status(400).json({ error: 'Token is required.' });
        }
        const invitation = await (0, invitationsService_1.validateInvitationToken)(token);
        if (!invitation) {
            return res.status(404).json({ error: 'Invite not found.' });
        }
        res.json({
            success: true,
            valid: invitation.canAccept,
            invitation,
            message: invitation.message,
        });
    }
    catch (error) {
        console.error('Validate invitation error:', error);
        res.status(500).json({ error: 'Could not validate invite.' });
    }
});
router.get('/:token/validate', async (req, res) => {
    try {
        const token = String(req.params.token ?? '').trim();
        if (!token) {
            return res.status(400).json({ error: 'Token is required.' });
        }
        const invitation = await (0, invitationsService_1.validateInvitationToken)(token);
        if (!invitation) {
            return res.status(404).json({ error: 'Invite not found.' });
        }
        res.json({
            success: true,
            valid: invitation.canAccept,
            invitation,
            message: invitation.message,
        });
    }
    catch (error) {
        console.error('Validate invitation error:', error);
        res.status(500).json({ error: 'Could not validate invite.' });
    }
});
router.post('/:token/accept', auth_1.authenticate, async (req, res) => {
    try {
        const token = String(req.params.token ?? '').trim();
        const email = String(req.body?.email ?? req.firebaseUser?.email ?? '').trim();
        const result = await (0, invitationsService_1.acceptInvitation)({
            token,
            firebaseUid: req.firebaseUser?.uid ?? '',
            email,
            firstName: req.body?.firstName ?? null,
            lastName: req.body?.lastName ?? null,
            phone: req.body?.phone ?? null,
        });
        res.status(201).json({ success: true, ...result });
    }
    catch (error) {
        console.error('Accept invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not accept invitation.';
        res.status(400).json({ error: message });
    }
});
router.post('/registration/complete', auth_1.authenticate, async (req, res) => {
    try {
        const result = await (0, invitationsService_1.completeUserRegistration)({
            firebaseUid: req.firebaseUser?.uid ?? '',
            firstName: String(req.body?.firstName ?? ''),
            lastName: String(req.body?.lastName ?? ''),
            phone: req.body?.phone ?? null,
            dateOfBirth: req.body?.dateOfBirth ?? null,
            avatarUrl: req.body?.avatarUrl ?? null,
        });
        res.json({ success: true, user: result });
    }
    catch (error) {
        console.error('Complete registration error:', error);
        const message = error instanceof Error ? error.message : 'Could not complete registration.';
        res.status(400).json({ error: message });
    }
});
exports.default = router;

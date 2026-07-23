"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requestContext_1 = require("../lib/requestContext");
const auth_1 = require("../middleware/auth");
const manageAccessService_1 = require("../lib/manageAccessService");
const rateLimit_1 = require("../middleware/rateLimit");
const auditService_1 = require("../services/auditService");
const router = (0, express_1.Router)();
router.use(auth_1.authenticate);
function readInviteRole(value) {
    return value === 'player' || value === 'parent' || value === 'coach' ? value : null;
}
router.get('/requests', async (req, res) => {
    const user = await (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    try {
        const requests = await (0, manageAccessService_1.listManageAccessRequests)(user);
        res.json(requests);
    }
    catch (error) {
        console.error('Failed to list access requests:', error);
        res.status(500).json({ error: 'Could not load access requests.' });
    }
});
const mutateLimiter = (0, rateLimit_1.rateLimit)({ bucket: 'manage-access:mutate', limit: 30, windowMs: 60_000 });
const inviteLimiter = (0, rateLimit_1.rateLimit)({ bucket: 'manage-access:invite', limit: 10, windowMs: 60_000 });
function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}
router.post('/requests/:id/approve', mutateLimiter, async (req, res) => {
    const user = await (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const requestId = parseId(String(req.params.id));
    if (requestId == null) {
        res.status(400).json({ error: 'Invalid request id.' });
        return;
    }
    try {
        const result = await (0, manageAccessService_1.approveManageAccessRequest)(user, requestId);
        await (0, auditService_1.writeAuditLog)({
            action: 'manage_access.request_approved',
            entityType: 'access_request',
            entityId: result.requestId,
            actorUserId: user.isHardcodedAdmin ? null : user.id,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: user.role ?? null,
            clubId: result.clubId,
            metadata: { targetUserId: result.targetUserId, role: result.role },
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
        });
        res.status(204).end();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not approve the request.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
});
router.post('/requests/:id/deny', mutateLimiter, async (req, res) => {
    const user = await (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const requestId = parseId(String(req.params.id));
    if (requestId == null) {
        res.status(400).json({ error: 'Invalid request id.' });
        return;
    }
    try {
        const result = await (0, manageAccessService_1.denyManageAccessRequest)(user, requestId);
        await (0, auditService_1.writeAuditLog)({
            action: 'manage_access.request_denied',
            entityType: 'access_request',
            entityId: result.requestId,
            actorUserId: user.isHardcodedAdmin ? null : user.id,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: user.role ?? null,
            clubId: result.clubId,
            metadata: { targetUserId: result.targetUserId, role: result.role },
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
        });
        res.status(204).end();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not deny the request.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
});
router.get('/invite-links/active', async (req, res) => {
    const user = await (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const role = readInviteRole(req.query.role);
    if (!role) {
        res.status(400).json({ error: 'A valid role is required.' });
        return;
    }
    try {
        const inviteLink = await (0, manageAccessService_1.getActiveClubInviteLink)(user, role);
        res.json(inviteLink);
    }
    catch (error) {
        console.error('Failed to load active invite link:', error);
        res.status(500).json({ error: 'Could not load the invite link.' });
    }
});
router.post('/invite-links/generate', inviteLimiter, async (req, res) => {
    const user = await (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const role = readInviteRole(req.body?.role);
    if (!role) {
        res.status(400).json({ error: 'A valid role is required.' });
        return;
    }
    const rawInterval = req.body?.refreshIntervalMinutes;
    if (rawInterval != null && !Number.isFinite(Number(rawInterval))) {
        res.status(400).json({ error: 'Refresh interval must be a number.' });
        return;
    }
    try {
        const inviteLink = await (0, manageAccessService_1.generateClubInviteLink)(user, role, Number(rawInterval));
        await (0, auditService_1.writeAuditLog)({
            action: 'manage_access.invite_link_generated',
            entityType: 'invite_link',
            entityId: inviteLink.id,
            actorUserId: user.isHardcodedAdmin ? null : user.id,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: user.role ?? null,
            clubId: inviteLink.clubId,
            metadata: { role: inviteLink.role, refreshIntervalMinutes: inviteLink.refreshIntervalMinutes },
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
        });
        res.status(201).json(inviteLink);
    }
    catch (error) {
        console.error('Failed to generate invite link:', error);
        res.status(500).json({ error: 'Could not generate the invite link.' });
    }
});
exports.default = router;

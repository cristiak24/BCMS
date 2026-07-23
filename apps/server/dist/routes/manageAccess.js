"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
router.get('/requests', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    try {
        const requests = yield (0, manageAccessService_1.listManageAccessRequests)(user);
        res.json(requests);
    }
    catch (error) {
        console.error('Failed to list access requests:', error);
        res.status(500).json({ error: 'Could not load access requests.' });
    }
}));
const mutateLimiter = (0, rateLimit_1.rateLimit)({ bucket: 'manage-access:mutate', limit: 30, windowMs: 60000 });
const inviteLimiter = (0, rateLimit_1.rateLimit)({ bucket: 'manage-access:invite', limit: 10, windowMs: 60000 });
function parseId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}
router.post('/requests/:id/approve', mutateLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const user = yield (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const requestId = parseId(String(req.params.id));
    if (requestId == null) {
        res.status(400).json({ error: 'Invalid request id.' });
        return;
    }
    try {
        const result = yield (0, manageAccessService_1.approveManageAccessRequest)(user, requestId);
        yield (0, auditService_1.writeAuditLog)({
            action: 'manage_access.request_approved',
            entityType: 'access_request',
            entityId: result.requestId,
            actorUserId: user.isHardcodedAdmin ? null : user.id,
            actorUid: (_b = (_a = req.firebaseUser) === null || _a === void 0 ? void 0 : _a.uid) !== null && _b !== void 0 ? _b : null,
            actorRole: (_c = user.role) !== null && _c !== void 0 ? _c : null,
            clubId: result.clubId,
            metadata: { targetUserId: result.targetUserId, role: result.role },
            ipAddress: (_d = req.ip) !== null && _d !== void 0 ? _d : null,
            userAgent: (_e = req.get('user-agent')) !== null && _e !== void 0 ? _e : null,
        });
        res.status(204).end();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not approve the request.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
}));
router.post('/requests/:id/deny', mutateLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const user = yield (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const requestId = parseId(String(req.params.id));
    if (requestId == null) {
        res.status(400).json({ error: 'Invalid request id.' });
        return;
    }
    try {
        const result = yield (0, manageAccessService_1.denyManageAccessRequest)(user, requestId);
        yield (0, auditService_1.writeAuditLog)({
            action: 'manage_access.request_denied',
            entityType: 'access_request',
            entityId: result.requestId,
            actorUserId: user.isHardcodedAdmin ? null : user.id,
            actorUid: (_b = (_a = req.firebaseUser) === null || _a === void 0 ? void 0 : _a.uid) !== null && _b !== void 0 ? _b : null,
            actorRole: (_c = user.role) !== null && _c !== void 0 ? _c : null,
            clubId: result.clubId,
            metadata: { targetUserId: result.targetUserId, role: result.role },
            ipAddress: (_d = req.ip) !== null && _d !== void 0 ? _d : null,
            userAgent: (_e = req.get('user-agent')) !== null && _e !== void 0 ? _e : null,
        });
        res.status(204).end();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not deny the request.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
}));
router.get('/invite-links/active', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const role = readInviteRole(req.query.role);
    if (!role) {
        res.status(400).json({ error: 'A valid role is required.' });
        return;
    }
    try {
        const inviteLink = yield (0, manageAccessService_1.getActiveClubInviteLink)(user, role);
        res.json(inviteLink);
    }
    catch (error) {
        console.error('Failed to load active invite link:', error);
        res.status(500).json({ error: 'Could not load the invite link.' });
    }
}));
router.post('/invite-links/generate', inviteLimiter, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    const user = yield (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const role = readInviteRole((_a = req.body) === null || _a === void 0 ? void 0 : _a.role);
    if (!role) {
        res.status(400).json({ error: 'A valid role is required.' });
        return;
    }
    const rawInterval = (_b = req.body) === null || _b === void 0 ? void 0 : _b.refreshIntervalMinutes;
    if (rawInterval != null && !Number.isFinite(Number(rawInterval))) {
        res.status(400).json({ error: 'Refresh interval must be a number.' });
        return;
    }
    try {
        const inviteLink = yield (0, manageAccessService_1.generateClubInviteLink)(user, role, Number(rawInterval));
        yield (0, auditService_1.writeAuditLog)({
            action: 'manage_access.invite_link_generated',
            entityType: 'invite_link',
            entityId: inviteLink.id,
            actorUserId: user.isHardcodedAdmin ? null : user.id,
            actorUid: (_d = (_c = req.firebaseUser) === null || _c === void 0 ? void 0 : _c.uid) !== null && _d !== void 0 ? _d : null,
            actorRole: (_e = user.role) !== null && _e !== void 0 ? _e : null,
            clubId: inviteLink.clubId,
            metadata: { role: inviteLink.role, refreshIntervalMinutes: inviteLink.refreshIntervalMinutes },
            ipAddress: (_f = req.ip) !== null && _f !== void 0 ? _f : null,
            userAgent: (_g = req.get('user-agent')) !== null && _g !== void 0 ? _g : null,
        });
        res.status(201).json(inviteLink);
    }
    catch (error) {
        console.error('Failed to generate invite link:', error);
        res.status(500).json({ error: 'Could not generate the invite link.' });
    }
}));
exports.default = router;

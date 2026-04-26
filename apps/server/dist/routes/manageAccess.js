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
const manageAccessService_1 = require("../lib/manageAccessService");
const router = (0, express_1.Router)();
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
router.post('/requests/:id/approve', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    try {
        yield (0, manageAccessService_1.approveManageAccessRequest)(user, Number(req.params.id));
        res.status(204).end();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not approve the request.';
        const status = message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: message });
    }
}));
router.post('/requests/:id/deny', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    try {
        yield (0, manageAccessService_1.denyManageAccessRequest)(user, Number(req.params.id));
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
router.post('/invite-links/generate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const user = yield (0, requestContext_1.requireClubAdmin)(req, res);
    if (!user) {
        return;
    }
    const role = readInviteRole((_a = req.body) === null || _a === void 0 ? void 0 : _a.role);
    if (!role) {
        res.status(400).json({ error: 'A valid role is required.' });
        return;
    }
    try {
        const inviteLink = yield (0, manageAccessService_1.generateClubInviteLink)(user, role, Number((_b = req.body) === null || _b === void 0 ? void 0 : _b.refreshIntervalMinutes));
        res.status(201).json(inviteLink);
    }
    catch (error) {
        console.error('Failed to generate invite link:', error);
        res.status(500).json({ error: 'Could not generate the invite link.' });
    }
}));
exports.default = router;

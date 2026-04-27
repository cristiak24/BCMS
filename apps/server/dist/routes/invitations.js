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
const auth_1 = require("../middleware/auth");
const invitationsService_1 = require("../services/invitationsService");
const router = (0, express_1.Router)();
router.get('/', auth_1.authenticate, auth_1.requireSuperadmin, (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const invitations = yield (0, invitationsService_1.listInvitations)();
        res.json({ success: true, invitations });
    }
    catch (error) {
        console.error('List invitations error:', error);
        res.status(500).json({ error: 'Could not load invitations.' });
    }
}));
router.post('/', auth_1.authenticate, auth_1.requireSuperadmin, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const result = yield (0, invitationsService_1.createSuperAdminInvitation)({
            email: String((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.email) !== null && _b !== void 0 ? _b : ''),
            fullName: String((_d = (_c = req.body) === null || _c === void 0 ? void 0 : _c.fullName) !== null && _d !== void 0 ? _d : ''),
            role: (_e = req.body) === null || _e === void 0 ? void 0 : _e.role,
            clubId: Number((_f = req.body) === null || _f === void 0 ? void 0 : _f.clubId),
        }, {
            user: req.user,
            firebaseUser: req.firebaseUser,
            ip: req.ip,
            userAgent: (_g = req.get('user-agent')) !== null && _g !== void 0 ? _g : undefined,
        });
        res.status(201).json({ success: true, invitation: result });
    }
    catch (error) {
        console.error('Create invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not create invitation.';
        res.status(400).json({ error: message });
    }
}));
router.get('/:token', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const token = String((_a = req.params.token) !== null && _a !== void 0 ? _a : '').trim();
        if (!token) {
            return res.status(400).json({ error: 'Token is required.' });
        }
        const invitation = yield (0, invitationsService_1.validateInvitationToken)(token);
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
}));
router.get('/:token/validate', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const token = String((_a = req.params.token) !== null && _a !== void 0 ? _a : '').trim();
        if (!token) {
            return res.status(400).json({ error: 'Token is required.' });
        }
        const invitation = yield (0, invitationsService_1.validateInvitationToken)(token);
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
}));
router.post('/:token/accept', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        const token = String((_a = req.params.token) !== null && _a !== void 0 ? _a : '').trim();
        const email = String((_e = (_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.email) !== null && _c !== void 0 ? _c : (_d = req.firebaseUser) === null || _d === void 0 ? void 0 : _d.email) !== null && _e !== void 0 ? _e : '').trim();
        const result = yield (0, invitationsService_1.acceptInvitation)({
            token,
            firebaseUid: (_g = (_f = req.firebaseUser) === null || _f === void 0 ? void 0 : _f.uid) !== null && _g !== void 0 ? _g : '',
            email,
            firstName: (_j = (_h = req.body) === null || _h === void 0 ? void 0 : _h.firstName) !== null && _j !== void 0 ? _j : null,
            lastName: (_l = (_k = req.body) === null || _k === void 0 ? void 0 : _k.lastName) !== null && _l !== void 0 ? _l : null,
            phone: (_o = (_m = req.body) === null || _m === void 0 ? void 0 : _m.phone) !== null && _o !== void 0 ? _o : null,
        });
        res.status(201).json(Object.assign({ success: true }, result));
    }
    catch (error) {
        console.error('Accept invitation error:', error);
        const message = error instanceof Error ? error.message : 'Could not accept invitation.';
        res.status(400).json({ error: message });
    }
}));
router.post('/registration/complete', auth_1.authenticate, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    try {
        const result = yield (0, invitationsService_1.completeUserRegistration)({
            firebaseUid: (_b = (_a = req.firebaseUser) === null || _a === void 0 ? void 0 : _a.uid) !== null && _b !== void 0 ? _b : '',
            firstName: String((_d = (_c = req.body) === null || _c === void 0 ? void 0 : _c.firstName) !== null && _d !== void 0 ? _d : ''),
            lastName: String((_f = (_e = req.body) === null || _e === void 0 ? void 0 : _e.lastName) !== null && _f !== void 0 ? _f : ''),
            phone: (_h = (_g = req.body) === null || _g === void 0 ? void 0 : _g.phone) !== null && _h !== void 0 ? _h : null,
            dateOfBirth: (_k = (_j = req.body) === null || _j === void 0 ? void 0 : _j.dateOfBirth) !== null && _k !== void 0 ? _k : null,
            avatarUrl: (_m = (_l = req.body) === null || _l === void 0 ? void 0 : _l.avatarUrl) !== null && _m !== void 0 ? _m : null,
        });
        res.json({ success: true, user: result });
    }
    catch (error) {
        console.error('Complete registration error:', error);
        const message = error instanceof Error ? error.message : 'Could not complete registration.';
        res.status(400).json({ error: message });
    }
}));
exports.default = router;

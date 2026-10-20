import { Router } from 'express';
import { authenticate, requireSuperadmin, type AuthenticatedRequest } from '../middleware/auth';
import {
  acceptInvitation,
  completeUserRegistration,
  createSuperAdminInvitation,
  listInvitations,
  validateInvitationToken,
} from '../services/invitationsService';
import { clientIp, rateLimit } from '../middleware/rateLimit';
import { sendRouteError } from '../lib/httpErrors';

const router = Router();

// The token routes are reachable without a session (by IP then), so they are
// throttled against token guessing and hammering.
const publicInviteLimiter = rateLimit({ bucket: 'invitations:token', limit: 30, windowMs: 60_000, key: (req) => `ip:${clientIp(req)}` });

router.get('/', authenticate, requireSuperadmin, async (_req, res) => {
  try {
    const invitations = await listInvitations();
    res.json({ success: true, invitations });
  } catch (error) {
    console.error('List invitations error:', error);
    res.status(500).json({ error: 'Could not load invitations.' });
  }
});

router.post('/', authenticate, requireSuperadmin, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await createSuperAdminInvitation(
      {
        email: String(req.body?.email ?? ''),
        fullName: String(req.body?.fullName ?? ''),
        role: req.body?.role,
        clubId: Number(req.body?.clubId),
      },
      {
        user: req.user,
        clerkUser: req.clerkUser,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      },
    );

    res.status(201).json({ success: true, invitation: result });
  } catch (error) {
    sendRouteError(res, error, { fallback: 'Nu am putut crea invitația.', log: 'Create invitation error:' });
  }
});

router.get('/:token', publicInviteLimiter, async (req, res) => {
  try {
    const token = String(req.params.token ?? '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Token is required.' });
    }

    const invitation = await validateInvitationToken(token);
    if (!invitation) {
      return res.status(404).json({ error: 'Invite not found.' });
    }

    res.json({
      success: true,
      valid: invitation.canAccept,
      invitation,
      message: invitation.message,
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({ error: 'Could not validate invite.' });
  }
});

router.get('/:token/validate', publicInviteLimiter, async (req, res) => {
  try {
    const token = String(req.params.token ?? '').trim();
    if (!token) {
      return res.status(400).json({ error: 'Token is required.' });
    }

    const invitation = await validateInvitationToken(token);
    if (!invitation) {
      return res.status(404).json({ error: 'Invite not found.' });
    }

    res.json({
      success: true,
      valid: invitation.canAccept,
      invitation,
      message: invitation.message,
    });
  } catch (error) {
    console.error('Validate invitation error:', error);
    res.status(500).json({ error: 'Could not validate invite.' });
  }
});

router.post('/:token/accept', publicInviteLimiter, authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const token = String(req.params.token ?? '').trim();
    const result = await acceptInvitation({
      token,
      clerkUserId: req.clerkUser?.uid ?? '',
      // Only the verified email of the signed-in identity. A body `email` used
      // to be trusted here, which let anyone holding the link claim the
      // invited (or an existing) account.
      email: req.clerkUser?.email ?? null,
      firstName: req.body?.firstName ?? null,
      lastName: req.body?.lastName ?? null,
      phone: req.body?.phone ?? null,
    });

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    sendRouteError(res, error, { fallback: 'Nu am putut accepta invitația.', log: 'Accept invitation error:' });
  }
});

router.post('/registration/complete', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await completeUserRegistration({
      clerkUserId: req.clerkUser?.uid ?? '',
      firstName: String(req.body?.firstName ?? ''),
      lastName: String(req.body?.lastName ?? ''),
      phone: req.body?.phone ?? null,
      dateOfBirth: req.body?.dateOfBirth ?? null,
      avatarUrl: req.body?.avatarUrl ?? null,
    });

    res.json({ success: true, user: result });
  } catch (error) {
    sendRouteError(res, error, { fallback: 'Nu am putut finaliza înregistrarea.', log: 'Complete registration error:' });
  }
});

export default router;

import { Router } from 'express';
import { authenticate, requireSuperadmin, type AuthenticatedRequest } from '../middleware/auth';
import {
  acceptInvitation,
  completeUserRegistration,
  createSuperAdminInvitation,
  listInvitations,
  validateInvitationToken,
} from '../services/invitationsService';

const router = Router();

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
        firebaseUser: req.firebaseUser,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      },
    );

    res.status(201).json({ success: true, invitation: result });
  } catch (error) {
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

router.get('/:token/validate', async (req, res) => {
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

router.post('/:token/accept', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const token = String(req.params.token ?? '').trim();
    const email = String(req.body?.email ?? req.firebaseUser?.email ?? '').trim();
    const result = await acceptInvitation({
      token,
      firebaseUid: req.firebaseUser?.uid ?? '',
      email,
      firstName: req.body?.firstName ?? null,
      lastName: req.body?.lastName ?? null,
      phone: req.body?.phone ?? null,
    });

    res.status(201).json({ success: true, ...result });
  } catch (error) {
    console.error('Accept invitation error:', error);
    const message = error instanceof Error ? error.message : 'Could not accept invitation.';
    res.status(400).json({ error: message });
  }
});

router.post('/registration/complete', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await completeUserRegistration({
      firebaseUid: req.firebaseUser?.uid ?? '',
      firstName: String(req.body?.firstName ?? ''),
      lastName: String(req.body?.lastName ?? ''),
      phone: req.body?.phone ?? null,
      dateOfBirth: req.body?.dateOfBirth ?? null,
      avatarUrl: req.body?.avatarUrl ?? null,
    });

    res.json({ success: true, user: result });
  } catch (error) {
    console.error('Complete registration error:', error);
    const message = error instanceof Error ? error.message : 'Could not complete registration.';
    res.status(400).json({ error: message });
  }
});

export default router;

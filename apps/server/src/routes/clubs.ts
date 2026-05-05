import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { clubs, invites, users } from '../db/schema';
import { authenticate, requireSuperadmin, type AuthenticatedRequest } from '../middleware/auth';
import { writeAuditLog } from '../services/auditService';
import { isVisiblePendingInvite, syncInvitationStatuses } from '../services/invitationsService';

const router = Router();

function toClubSummary(
  club: typeof clubs.$inferSelect,
  userRows: Array<typeof users.$inferSelect>,
  inviteRows: Array<typeof invites.$inferSelect>,
) {
  const clubUsers = userRows.filter((user) => user.clubId === club.id);
  const now = new Date();

  return {
    ...club,
    status: 'active' as const,
    usersCount: clubUsers.length,
    userCount: clubUsers.length,
    adminsCount: clubUsers.filter((user) => user.role === 'admin').length,
    adminCount: clubUsers.filter((user) => user.role === 'admin').length,
    coachCount: clubUsers.filter((user) => user.role === 'coach').length,
    staffCount: clubUsers.filter((user) => user.role === 'staff' || user.role === 'accountant').length,
    playerCount: clubUsers.filter((user) => user.role === 'player').length,
    pendingInviteCount: inviteRows.filter((invite) => invite.clubId === club.id && isVisiblePendingInvite(invite, userRows, now)).length,
  };
}

router.use(authenticate, requireSuperadmin);

router.get('/', async (_req, res) => {
  try {
    await syncInvitationStatuses();

    const [clubRows, userRows, inviteRows] = await Promise.all([
      db.select().from(clubs).orderBy(desc(clubs.updatedAt)),
      db.select().from(users),
      db.select().from(invites),
    ]);

    res.json({
      success: true,
      clubs: clubRows.map((club) => toClubSummary(club, userRows, inviteRows)),
    });
  } catch (error) {
    console.error('List clubs error:', error);
    res.status(500).json({ error: 'Could not load clubs.' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res) => {
  try {
    const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) {
      return res.status(400).json({ error: 'Club name is required.' });
    }

    const normalizedName = name.toLowerCase();
    const existing = await db.select().from(clubs).where(eq(clubs.normalizedName, normalizedName)).limit(1);
    if (existing[0]) {
      return res.status(409).json({ error: 'Club already exists.' });
    }

    const inserted = await db.insert(clubs).values({
      name,
      normalizedName,
      createdBy: req.user?.id == null ? null : String(req.user.id),
    }).returning();

    const club = inserted[0];

    await writeAuditLog({
      action: 'club.created',
      entityType: 'club',
      entityId: club.id,
      actorUserId: req.user?.id ?? null,
      actorUid: req.firebaseUser?.uid ?? null,
      actorRole: req.user?.role ?? null,
      clubId: club.id,
      metadata: { name },
    });

    res.status(201).json({
      success: true,
      club: toClubSummary(club, [], []),
    });
  } catch (error) {
    console.error('Create club error:', error);
    res.status(500).json({ error: 'Could not create club.' });
  }
});

export default router;

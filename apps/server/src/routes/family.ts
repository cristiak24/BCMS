import { Router } from 'express';
import { and, eq, inArray } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { db } from '../db';
import { familyJoinRequests, playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { guardianChildren, teamIdsOfPlayers } from '../lib/selfPlayer';
import { parseBirthDate } from '../lib/familyJoin';
import { createJoinRequests, findTeamByJoinCode } from '../lib/familyJoinService';
import { createGuardianInvite, redeemGuardianInvite } from '../lib/guardianInvites';
import { writeAuditLog } from '../services/auditService';

/**
 * Parent ↔ child links.
 *
 * Parent:
 *   GET  /api/family/children               → linked children + pending requests
 *   POST /api/family/children/request       → { teamCode, firstName, lastName, birthDate } (approval follows)
 *   POST /api/family/invites/accept         → { token } — personal invite while already signed in
 * Club admin, or the coach of one of the player's teams:
 *   GET    /api/family/players/:id/guardians
 *   POST   /api/family/players/:id/invites   → personal single-use invite link token
 *   DELETE /api/family/players/:id/guardians/:userId
 */

const router = Router();
router.use(authenticate);

const limiter = rateLimit({ bucket: 'family:mutate', limit: 30, windowMs: 60_000 });

function requireParent(req: AuthenticatedRequest) {
    return req.user?.role === 'parent' && req.user?.status === 'active';
}

router.get('/children', async (req: AuthenticatedRequest, res) => {
    try {
        if (req.user?.role !== 'parent') {
            res.json({ children: [], pending: [] });
            return;
        }
        const children = await guardianChildren(Number(req.user.id));
        const teamRows = children.length
            ? await db.select({ playerId: playersToTeams.playerId, name: teams.name })
                .from(playersToTeams).innerJoin(teams, eq(teams.id, playersToTeams.teamId))
                .where(inArray(playersToTeams.playerId, children.map((c) => c.id)))
            : [];
        const directTeams = children.filter((c) => c.teamId != null).length
            ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, children.map((c) => c.teamId!).filter(Boolean)))
            : [];
        const pending = await db.select({ id: familyJoinRequests.id, firstName: familyJoinRequests.childFirstName, lastName: familyJoinRequests.childLastName, status: familyJoinRequests.status, teamName: teams.name })
            .from(familyJoinRequests).innerJoin(teams, eq(teams.id, familyJoinRequests.teamId))
            .where(and(eq(familyJoinRequests.userId, Number(req.user.id)), inArray(familyJoinRequests.status, ['pending', 'denied'])));

        res.json({
            children: children.map((child) => {
                const names = new Set<string>(teamRows.filter((t) => t.playerId === child.id).map((t) => t.name));
                const direct = directTeams.find((t) => t.id === child.teamId);
                if (direct) names.add(direct.name);
                return {
                    id: child.id,
                    firstName: child.firstName ?? '',
                    lastName: child.lastName ?? '',
                    number: child.number ?? null,
                    birthYear: child.birthYear ?? null,
                    teams: Array.from(names),
                };
            }),
            pending,
        });
    } catch (error) {
        console.error('[family/children] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca copiii.' });
    }
});

router.post('/children/request', limiter, async (req: AuthenticatedRequest, res) => {
    try {
        if (!requireParent(req)) {
            res.status(403).json({ error: 'Doar conturile de părinte pot adăuga copii.' });
            return;
        }
        const hit = await findTeamByJoinCode(String(req.body?.teamCode ?? ''));
        if (!hit || hit.team.clubId !== Number(req.user.clubId)) {
            res.status(400).json({ error: 'Codul echipei nu este valid. Cere-l antrenorului.' });
            return;
        }
        const firstName = String(req.body?.firstName ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const lastName = String(req.body?.lastName ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!firstName || !lastName) {
            res.status(400).json({ error: 'Completează numele și prenumele copilului.' });
            return;
        }
        const birthDate = parseBirthDate(req.body?.birthDate);
        if (!birthDate.ok) {
            res.status(400).json({ error: birthDate.error });
            return;
        }
        const [request] = await createJoinRequests({
            userId: Number(req.user.id),
            team: hit.team,
            firstName: req.user.firstName ?? '',
            lastName: req.user.lastName ?? '',
            input: { kind: 'parent', phone: req.user.phone ?? '', children: [{ firstName, lastName, birthDate: birthDate.value }] },
        });
        res.status(201).json({ id: request.id, teamName: hit.team.name, status: 'pending' });
    } catch (error) {
        console.error('[family/children/request] error:', error);
        res.status(500).json({ error: 'Nu am putut trimite cererea.' });
    }
});

router.post('/invites/accept', limiter, async (req: AuthenticatedRequest, res) => {
    try {
        if (!requireParent(req)) {
            res.status(403).json({ error: 'Invitația este pentru un cont de părinte.' });
            return;
        }
        const redeemed = await redeemGuardianInvite(String(req.body?.token ?? ''), Number(req.user.id));
        if (!redeemed || redeemed.clubId !== Number(req.user.clubId)) {
            res.status(400).json({ error: 'Invitația nu mai este valabilă. Cere una nouă clubului.' });
            return;
        }
        res.json({ playerId: redeemed.playerId });
    } catch (error) {
        console.error('[family/invites/accept] error:', error);
        res.status(500).json({ error: 'Nu am putut accepta invitația.' });
    }
});

/** The player, if the caller is a club admin or coaches one of the player's teams. */
async function managedPlayer(req: AuthenticatedRequest, playerId: number) {
    const role = req.user?.role;
    const clubId = req.user?.clubId == null ? null : Number(req.user.clubId);
    if (clubId == null || !Number.isInteger(playerId) || (role !== 'admin' && role !== 'coach')) return null;

    const teamIds = await teamIdsOfPlayers([playerId]);
    if (!teamIds.length) return null;
    const teamRows = await db.select({ id: teams.id, coachId: teams.coachId }).from(teams)
        .where(and(inArray(teams.id, teamIds), eq(teams.clubId, clubId)));
    if (!teamRows.length) return null;
    if (role === 'coach' && !teamRows.some((t) => t.coachId === Number(req.user.id))) return null;
    const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    return player ? { player, clubId } : null;
}

router.get('/players/:id/guardians', async (req: AuthenticatedRequest, res) => {
    try {
        const managed = await managedPlayer(req, Number(req.params.id));
        if (!managed) {
            res.status(404).json({ error: 'Jucătorul nu există.' });
            return;
        }
        const rows = await db.select({ userId: users.id, name: users.name, email: users.email, phone: users.phone, status: users.status })
            .from(playerGuardians).innerJoin(users, eq(users.id, playerGuardians.userId))
            .where(eq(playerGuardians.playerId, managed.player.id));
        res.json(rows);
    } catch (error) {
        console.error('[family/guardians] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca părinții.' });
    }
});

router.post('/players/:id/invites', limiter, async (req: AuthenticatedRequest, res) => {
    try {
        const managed = await managedPlayer(req, Number(req.params.id));
        if (!managed) {
            res.status(404).json({ error: 'Jucătorul nu există.' });
            return;
        }
        const invite = await createGuardianInvite({ clubId: managed.clubId, playerId: managed.player.id, createdBy: Number(req.user.id) });
        await writeAuditLog({
            action: 'family.guardian_invite_create',
            entityType: 'player',
            entityId: managed.player.id,
            actorUserId: req.user?.id ?? null,
            actorUid: req.firebaseUser?.uid ?? null,
            actorRole: req.user?.role ?? null,
            clubId: managed.clubId,
            metadata: null,
            ipAddress: req.ip ?? null,
            userAgent: req.get('user-agent') ?? null,
        }).catch(() => undefined);
        res.status(201).json({ token: invite.token, expiresAt: invite.expiresAt, childName: `${managed.player.firstName ?? ''} ${managed.player.lastName ?? ''}`.trim() });
    } catch (error) {
        console.error('[family/invites] error:', error);
        res.status(500).json({ error: 'Nu am putut crea invitația.' });
    }
});

router.delete('/players/:id/guardians/:userId', limiter, async (req: AuthenticatedRequest, res) => {
    try {
        const managed = await managedPlayer(req, Number(req.params.id));
        if (!managed) {
            res.status(404).json({ error: 'Jucătorul nu există.' });
            return;
        }
        await db.delete(playerGuardians).where(and(eq(playerGuardians.playerId, managed.player.id), eq(playerGuardians.userId, Number(req.params.userId))));
        res.status(204).end();
    } catch (error) {
        console.error('[family/unlink] error:', error);
        res.status(500).json({ error: 'Nu am putut dezlega părintele.' });
    }
});

export default router;

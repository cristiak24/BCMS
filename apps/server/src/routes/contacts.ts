import { Router } from 'express';
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { authenticate, type AuthenticatedRequest } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { writeAuditLog } from '../services/auditService';
import { db } from '../db';
import { playerGuardians, players, playersToTeams, teams, users } from '../db/schema';
import { resolveRequestClubId } from '../lib/tenantScope';
import { isContactStaff, parsePlayerContact } from '../lib/contacts';
import { guardianChildren, resolveSelfPlayer, teamIdsOfPlayers } from '../lib/selfPlayer';

/**
 * Club contact book.
 *
 *   GET /api/contacts
 *     admin/coach → { mode: 'staff', teams, players (own + parents' numbers), staff }
 *     everyone else → { mode: 'member', staff } — coaches' and admins' numbers,
 *                     their own team's coaches first. Never another family's number.
 *   PUT /api/contacts/players/:id   (admin/coach) → set a player's and parents' numbers
 *
 * Staff numbers are the ones each person saved in their profile (users.phone).
 */

const router = Router();
router.use(authenticate);

async function clubStaff(clubId: number) {
    const [staffRows, teamRows] = await Promise.all([
        db.select({ id: users.id, name: users.name, role: users.role, phone: users.phone })
            .from(users)
            .where(and(eq(users.clubId, clubId), inArray(users.role, ['admin', 'coach']), ne(users.status, 'disabled'))),
        db.select({ id: teams.id, name: teams.name, coachId: teams.coachId }).from(teams).where(eq(teams.clubId, clubId)),
    ]);
    return {
        teamRows,
        staff: staffRows
            .map((user) => ({
                id: user.id,
                name: user.name,
                role: user.role,
                phone: user.phone?.trim() || null,
                teams: teamRows.filter((team) => team.coachId === user.id).map((team) => ({ id: team.id, name: team.name })),
            }))
            // Coaches before admins, then by name.
            .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'coach' ? -1 : 1)),
    };
}

router.get('/', async (req: AuthenticatedRequest, res) => {
    try {
        const clubId = resolveRequestClubId(req.user);
        if (clubId == null) {
            res.json({ mode: isContactStaff(req.user?.role) ? 'staff' : 'member', teams: [], players: [], staff: [] });
            return;
        }
        const { staff, teamRows } = await clubStaff(clubId);
        const teamIds = teamRows.map((team) => team.id);

        if (!isContactStaff(req.user?.role)) {
            // The caller's teams: a player's own; a parent's — every linked child's.
            const selfIds = req.user?.role === 'parent'
                ? (await guardianChildren(Number(req.user.id))).map((child) => child.id)
                : [(await resolveSelfPlayer(req.user))?.id].filter((id): id is number => id != null);
            const myTeamIds = new Set<number>(await teamIdsOfPlayers(selfIds));
            const visible = staff
                .filter((person) => person.phone)
                .map((person) => ({ ...person, ownTeam: person.teams.some((team) => myTeamIds.has(team.id)) }))
                .sort((a, b) => Number(b.ownTeam) - Number(a.ownTeam));
            res.json({ mode: 'member', staff: visible });
            return;
        }

        if (!teamIds.length) {
            res.json({ mode: 'staff', teams: [], players: [], staff });
            return;
        }

        const [direct, memberships] = await Promise.all([
            db.select().from(players).where(inArray(players.teamId, teamIds)),
            db.select({ player: players, teamId: playersToTeams.teamId })
                .from(playersToTeams)
                .innerJoin(players, eq(players.id, playersToTeams.playerId))
                .where(inArray(playersToTeams.teamId, teamIds)),
        ]);
        const byId = new Map<number, { row: typeof players.$inferSelect; teamIds: Set<number> }>();
        direct.forEach((row) => byId.set(row.id, { row, teamIds: new Set(row.teamId != null ? [row.teamId] : []) }));
        memberships.forEach(({ player, teamId }) => {
            const entry = byId.get(player.id) ?? { row: player, teamIds: new Set<number>() };
            entry.teamIds.add(teamId);
            byId.set(player.id, entry);
        });

        // A player's own account phone (profile) is the fallback for their number.
        const emails = Array.from(byId.values()).map(({ row }) => row.email?.trim().toLowerCase()).filter((e): e is string => Boolean(e));
        const accounts = emails.length
            ? await db.select({ email: users.email, phone: users.phone }).from(users).where(inArray(users.email, emails))
            : [];
        const accountPhone = new Map(accounts.map((a) => [a.email.trim().toLowerCase(), a.phone?.trim() || null]));

        // Parents with their own account (player_guardians) bring their profile number.
        const guardianRows = byId.size
            ? await db.select({ playerId: playerGuardians.playerId, userId: users.id, name: users.name, phone: users.phone })
                .from(playerGuardians).innerJoin(users, eq(users.id, playerGuardians.userId))
                .where(inArray(playerGuardians.playerId, Array.from(byId.keys())))
            : [];

        const list = Array.from(byId.values())
            .filter(({ row }) => (row.status ?? 'active') !== 'inactive')
            .map(({ row, teamIds: memberOf }) => ({
                id: row.id,
                firstName: row.firstName ?? '',
                lastName: row.lastName ?? row.name ?? '',
                number: row.number ?? null,
                teamIds: Array.from(memberOf),
                phone: row.phone ?? null,
                accountPhone: row.email ? accountPhone.get(row.email.trim().toLowerCase()) ?? null : null,
                guardianName: row.guardianName ?? null,
                guardianPhone: row.guardianPhone ?? null,
                guardian2Name: row.guardian2Name ?? null,
                guardian2Phone: row.guardian2Phone ?? null,
                guardianAccounts: guardianRows
                    .filter((g) => g.playerId === row.id)
                    .map((g) => ({ userId: g.userId, name: g.name, phone: g.phone?.trim() || null })),
            }))
            .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));

        res.json({ mode: 'staff', teams: teamRows.map((t) => ({ id: t.id, name: t.name })), players: list, staff });
    } catch (error) {
        console.error('[contacts:list] error:', error);
        res.status(500).json({ error: 'Nu am putut încărca agenda.' });
    }
});

router.put(
    '/players/:id',
    rateLimit({ bucket: 'contacts:update', limit: 60, windowMs: 60_000 }),
    async (req: AuthenticatedRequest, res) => {
        try {
            const clubId = resolveRequestClubId(req.user);
            if (clubId == null || !isContactStaff(req.user?.role)) {
                res.status(403).json({ error: 'Doar adminii și antrenorii pot edita agenda.' });
                return;
            }
            const playerId = Number(req.params.id);
            if (!Number.isInteger(playerId) || playerId <= 0) {
                res.status(400).json({ error: 'Jucător invalid.' });
                return;
            }
            const parsed = parsePlayerContact(req.body);
            if (!parsed.ok) {
                res.status(400).json({ error: parsed.error });
                return;
            }

            // The player must be on one of this club's teams.
            const clubTeamIds = (await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, clubId))).map((t) => t.id);
            if (!clubTeamIds.length) {
                res.status(404).json({ error: 'Jucătorul nu există.' });
                return;
            }
            const owned = await db.select({ id: players.id })
                .from(players)
                .leftJoin(playersToTeams, eq(playersToTeams.playerId, players.id))
                .where(and(
                    eq(players.id, playerId),
                    or(inArray(players.teamId, clubTeamIds), inArray(playersToTeams.teamId, clubTeamIds)),
                ))
                .limit(1);
            if (!owned[0]) {
                res.status(404).json({ error: 'Jucătorul nu există.' });
                return;
            }

            const [before] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
            await db.update(players).set(parsed.value).where(eq(players.id, playerId));
            res.json({ id: playerId, ...parsed.value });

            // Which fields changed — not the numbers themselves (personal data).
            const changed = Object.keys(parsed.value).filter((key) => (
                String((before as Record<string, unknown> | undefined)?.[key] ?? '') !== String((parsed.value as Record<string, unknown>)[key] ?? '')
            ));
            if (changed.length) {
                await writeAuditLog({
                    action: 'player.contacts_updated',
                    entityType: 'player',
                    entityId: playerId,
                    actorUserId: req.user?.id ?? null,
                    actorUid: req.firebaseUser?.uid ?? null,
                    actorRole: req.user?.role ?? null,
                    clubId,
                    metadata: { fields: changed },
                });
            }
        } catch (error) {
            console.error('[contacts:update] error:', error);
            res.status(500).json({ error: 'Nu am putut salva contactele.' });
        }
    },
);

export default router;

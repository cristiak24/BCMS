/**
 * E2E data on top of the local-development club (apps/server/src/scripts/localDb.ts):
 *  - coach2 coaches U14, so the U12 coach is a coach of ANOTHER team there;
 *  - the parent has two children (Matei U12, Ana U14);
 *  - a player account for Luca Marin (U12);
 *  - three more players per team (the scorer needs at least five);
 *  - a pending invitation with a known token;
 *  - matches for the scorer and the delegated-scorekeeper scenarios;
 *  - every account has accepted the current Terms (else a consent gate covers the app).
 * Returns the ids the specs need (written to E2E.seedFile).
 */
import { eq } from 'drizzle-orm';
import type { SeedIds } from '../accounts';
import { ACCOUNTS } from '../accounts';

export async function seedE2E(): Promise<SeedIds> {
    // Loaded here, after start.ts pointed the app at the E2E database.
    const { db } = require('../../../apps/server/src/db') as typeof import('../../../apps/server/src/db');
    const schema = require('../../../apps/server/src/db/schema') as typeof import('../../../apps/server/src/db/schema');
    const { LEGAL_VERSION } = require('../../../apps/server/src/lib/legal') as typeof import('../../../apps/server/src/lib/legal');
    const { hashInviteToken } = require('../../../apps/server/src/services/invitationsService') as typeof import('../../../apps/server/src/services/invitationsService');

    const [club] = await db.select().from(schema.clubs).limit(1);
    const teamRows = await db.select().from(schema.teams).where(eq(schema.teams.clubId, club.id));
    const u12 = teamRows.find((t) => t.name.startsWith('U12'))!;
    const u14 = teamRows.find((t) => t.name.startsWith('U14'))!;
    const playerRows = await db.select().from(schema.players);
    const byFirst = (first: string) => playerRows.find((p) => p.firstName === first)!;
    const [matei, radu, luca, ana, elena] = ['Matei', 'Radu', 'Luca', 'Ana', 'Elena'].map(byFirst);
    const [admin] = await db.select().from(schema.users).where(eq(schema.users.email, ACCOUNTS.admin));
    const [parent] = await db.select().from(schema.users).where(eq(schema.users.email, ACCOUNTS.parent));

    const base = { status: 'active' as const, clubId: club.id };
    const [coach2] = await db.insert(schema.users).values({
        ...base, email: ACCOUNTS.coach2, name: 'Bogdan Antrenor', firstName: 'Bogdan', lastName: 'Antrenor', role: 'coach',
    }).returning();
    await db.insert(schema.users).values({
        ...base, email: ACCOUNTS.player, name: 'Luca Marin', firstName: 'Luca', lastName: 'Marin', role: 'player',
    });
    await db.update(schema.teams).set({ coachId: coach2.id }).where(eq(schema.teams.id, u14.id));
    await db.update(schema.players).set({ email: ACCOUNTS.player }).where(eq(schema.players.id, luca.id));
    await db.insert(schema.playerGuardians).values({ playerId: ana.id, userId: parent.id, createdBy: admin.id });
    const extra = await db.insert(schema.players).values([
        ['Andrei', 'Vasile', 11, 2014, u12.id], ['Mihai', 'Georgescu', 12, 2014, u12.id], ['Tudor', 'Pop', 14, 2015, u12.id],
        ['Ioana', 'Rusu', 6, 2012, u14.id], ['Maria', 'Stoica', 8, 2013, u14.id], ['Sofia', 'Dinu', 13, 2012, u14.id],
    ].map(([firstName, lastName, number, birthYear, teamId]) => ({
        name: `${firstName} ${lastName}`, firstName: String(firstName), lastName: String(lastName),
        number: Number(number), birthYear: Number(birthYear), teamId: Number(teamId), status: 'active',
    }))).returning();
    await db.insert(schema.playersToTeams).values(extra.map((player) => ({ playerId: player.id, teamId: player.teamId! })));

    const at = (days: number, hourUtc: number) => {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() + days);
        date.setUTCHours(hourUtc, 0, 0, 0);
        return date.toISOString();
    };
    const [u14Match, u12Match, delegatedMatch] = await db.insert(schema.events).values([
        { type: 'match', title: 'Meci U14 vs. CSS Test', startTime: at(3, 9), endTime: at(3, 11), teamId: u14.id, coachId: coach2.id, location: 'Sala 2' },
        { type: 'match', title: 'Amical U12 (scorer)', startTime: at(2, 14), endTime: at(2, 16), teamId: u12.id, location: 'Arena Mică' },
        { type: 'match', title: 'Amical U12 (delegat)', startTime: at(4, 14), endTime: at(4, 16), teamId: u12.id, location: 'Arena Mică' },
    ]).returning();

    const inviteToken = 'e2e-invite-token-0001';
    const inviteEmail = 'invitat@local.test';
    await db.insert(schema.invites).values({
        token: hashInviteToken(inviteToken), tokenHash: hashInviteToken(inviteToken), email: inviteEmail, role: 'coach',
        clubId: club.id, status: 'pending', expiresAt: at(5, 12), createdBy: admin.id,
    });

    const everyone = await db.select({ id: schema.users.id }).from(schema.users);
    await db.insert(schema.legalAcceptances).values(everyone.map((user) => ({ userId: user.id, version: LEGAL_VERSION })));

    return {
        clubId: club.id,
        users: { admin: admin.id, parent: parent.id, coach2: coach2.id },
        teams: { u12: u12.id, u14: u14.id },
        players: { matei: matei.id, radu: radu.id, luca: luca.id, ana: ana.id, elena: elena.id },
        events: { u14Match: u14Match.id, u12Match: u12Match.id, delegatedMatch: delegatedMatch.id },
        invite: { token: inviteToken, email: inviteEmail },
    };
}

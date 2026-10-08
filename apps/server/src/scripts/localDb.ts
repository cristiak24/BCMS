/**
 * npm run db:local [-- --reset]
 *
 * Creates (or updates) the local development database — PGlite in
 * apps/server/.pglite, never the production database — and fills an empty one
 * with a test club: admin, coach, accountant, two teams, players, fees with
 * arrears, sessions and payments. Then `npm run dev:local` runs the API on it.
 *
 * Sign in locally with your usual Clerk account: set LOCAL_ADMIN_EMAIL (or
 * LOCAL_COACH_EMAIL / LOCAL_ACCOUNTANT_EMAIL / LOCAL_PARENT_EMAIL) to its email
 * before seeding and that account becomes the club's admin (etc.) here.
 */
import './localEnv';
import fs from 'fs';
import path from 'path';
import { count } from 'drizzle-orm';
import { pushSchema } from 'drizzle-kit/api';
import * as schema from '../db/schema';

async function main() {
    const location = process.env.DATABASE_URL!.slice('pglite:'.length);
    if (process.argv.includes('--reset') && location !== 'memory') {
        fs.rmSync(path.resolve(location), { recursive: true, force: true });
        console.log(`Șters ${location}`);
    }

    const { db, pglite } = await import('../db');
    const { apply, hasDataLoss, warnings } = await pushSchema(schema as unknown as Record<string, unknown>, db as never);
    if (hasDataLoss) {
        console.warn('Schema nouă ar pierde date locale:', warnings.join('; '), '\nRulează cu --reset pentru o bază curată.');
        process.exit(1);
    }
    await apply();
    console.log('Schema aplicată.');

    const [{ value: clubCount }] = await db.select({ value: count() }).from(schema.clubs);
    if (clubCount > 0) {
        console.log('Baza are deja date — nu am adăugat nimic. Folosește --reset pentru a o reface.');
    } else {
        await seed(db);
        console.log('Date de test adăugate.');
    }
    await pglite?.close();
    console.log(`Gata: ${location}. Pornește API-ul cu: npm run dev:local --workspace=apps/server`);
}

type Db = typeof import('../db').db;

async function seed(db: Db) {
    const now = new Date();
    const iso = (date: Date) => date.toISOString();
    const daysFromNow = (days: number, hour = 18) => {
        const date = new Date(now);
        date.setDate(date.getDate() + days);
        date.setHours(hour, 0, 0, 0);
        return date;
    };
    const month = (offset: number) => {
        const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, month: date.getMonth() + 1, year: date.getFullYear() };
    };

    const [club] = await db.insert(schema.clubs).values({ name: 'CSM Test Local', normalizedName: 'csm test local' }).returning();
    const account = (email: string | undefined, fallback: string, name: string, role: 'admin' | 'coach' | 'accountant' | 'parent') => ({
        email: (email || fallback).trim().toLowerCase(), name, firstName: name.split(' ')[0], lastName: name.split(' ').slice(1).join(' ') || 'Test',
        role, status: 'active' as const, clubId: club.id,
    });
    const [admin, coach, , parent] = await db.insert(schema.users).values([
        account(process.env.LOCAL_ADMIN_EMAIL, 'admin@local.test', 'Andrei Admin', 'admin'),
        account(process.env.LOCAL_COACH_EMAIL, 'coach@local.test', 'Cristian Antrenor', 'coach'),
        account(process.env.LOCAL_ACCOUNTANT_EMAIL, 'contabil@local.test', 'Dana Contabil', 'accountant'),
        account(process.env.LOCAL_PARENT_EMAIL, 'parinte@local.test', 'Ioana Popescu', 'parent'),
    ]).returning();

    const [u12, u14] = await db.insert(schema.teams).values([
        { frbTeamId: '', name: 'U12 Masculin', frbLeagueId: '', leagueName: 'Campionat municipal', frbSeasonId: '', seasonName: '2026-2027', inviteCode: 'LOC012', clubId: club.id, gender: 'M', level: 'municipal', coachId: coach.id },
        { frbTeamId: '', name: 'U14 Feminin', frbLeagueId: '', leagueName: 'Campionat național', frbSeasonId: '', seasonName: '2026-2027', inviteCode: 'LOC014', clubId: club.id, gender: 'F', level: 'national' },
    ]).returning();

    const joined = iso(new Date(now.getFullYear() - 1, 8, 1));
    const roster = await db.insert(schema.players).values([
        { name: 'Matei Popescu', firstName: 'Matei', lastName: 'Popescu', number: 7, birthYear: 2014, teamId: u12.id, status: 'active', createdAt: joined, medicalCheckExpiry: iso(daysFromNow(20)) },
        { name: 'Radu Stan', firstName: 'Radu', lastName: 'Stan', number: 10, birthYear: 2014, teamId: u12.id, status: 'active', createdAt: joined, medicalCheckExpiry: iso(daysFromNow(-5)) },
        { name: 'Luca Marin', firstName: 'Luca', lastName: 'Marin', number: 4, birthYear: 2015, teamId: u12.id, status: 'active', createdAt: joined },
        { name: 'Ana Dumitrescu', firstName: 'Ana', lastName: 'Dumitrescu', number: 5, birthYear: 2012, teamId: u14.id, status: 'active', createdAt: joined, medicalCheckExpiry: iso(daysFromNow(200)) },
        { name: 'Elena Ionescu', firstName: 'Elena', lastName: 'Ionescu', number: 9, birthYear: 2012, teamId: u14.id, status: 'active', createdAt: iso(daysFromNow(-10)) },
    ]).returning();
    await db.insert(schema.playersToTeams).values(roster.map((player) => ({ playerId: player.id, teamId: player.teamId! })));
    await db.insert(schema.playerGuardians).values({ playerId: roster[0].id, userId: parent.id, createdBy: admin.id });

    // Fees with an arrears window starting two months back.
    await db.insert(schema.financialSettings).values({
        clubId: club.id, monthlyPlayerFee: 150, trainingLevy: 20, facilityFee: 0, autoAdjust: 1, paymentDueDay: 25, billingStartMonth: month(-2).key,
    });

    const sessions = await db.insert(schema.events).values([
        { type: 'training', title: 'Antrenament U12', startTime: iso(daysFromNow(-7)), endTime: iso(daysFromNow(-7, 19)), teamId: u12.id, coachId: coach.id, location: 'Sala Sporturilor' },
        { type: 'training', title: 'Antrenament U12', startTime: iso(daysFromNow(1)), endTime: iso(daysFromNow(1, 19)), teamId: u12.id, coachId: coach.id, location: 'Sala Sporturilor' },
        { type: 'match', title: 'Turneu de toamnă', startTime: iso(daysFromNow(10, 10)), endTime: iso(daysFromNow(10, 14)), teamId: u12.id, coachId: coach.id, location: 'Arena Mică', amount: 50 },
        { type: 'training', title: 'Antrenament U14', startTime: iso(daysFromNow(2)), endTime: iso(daysFromNow(2, 19)), teamId: u14.id, location: 'Sala 2' },
    ]).returning();
    const past = sessions[0];
    await db.insert(schema.attendance).values(roster.filter((player) => player.teamId === u12.id).map((player, index) => ({
        playerId: player.id, teamId: u12.id, eventId: past.id, date: past.startTime, status: index === 1 ? 'absent' : 'present',
    })));

    // Payments: Matei paid two months ago (cash), Ana is up to date for the past months.
    const two = month(-2);
    const one = month(-1);
    await db.insert(schema.playerPayments).values([
        { playerId: roster[0].id, amount: 170, month: two.month, year: two.year, status: 'paid', date: iso(new Date(two.year, two.month - 1, 20)), method: 'cash', description: 'Chitanța 101', feeIds: `monthly:${two.key},levy:${two.key}` },
        { playerId: roster[3].id, amount: 340, month: one.month, year: one.year, status: 'paid', date: iso(new Date(one.year, one.month - 1, 15)), method: 'transfer', description: 'Transfer', feeIds: `monthly:${two.key},levy:${two.key},monthly:${one.key},levy:${one.key}` },
    ]);

    await db.insert(schema.financialDocuments).values([
        { type: 'Expense', amount: 320, description: 'Arbitraj turneu', status: 'pending', clubId: club.id },
        { type: 'Invoice', amount: 1200, description: 'Chirie sală', status: 'processed', clubId: club.id },
    ]);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

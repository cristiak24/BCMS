"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financialDocuments = exports.players = exports.teams = exports.users = exports.statusEnum = exports.roleEnum = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.roleEnum = (0, pg_core_1.pgEnum)('role', ['admin', 'coach', 'accountant']);
exports.statusEnum = (0, pg_core_1.pgEnum)('status', ['pending', 'processed', 'rejected']);
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    email: (0, pg_core_1.varchar)('email', { length: 255 }).notNull().unique(),
    passwordHash: (0, pg_core_1.text)('password_hash').notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    role: (0, exports.roleEnum)('role').default('coach').notNull(),
    status: (0, exports.statusEnum)('status').default('pending').notNull(),
});
exports.teams = (0, pg_core_1.pgTable)('teams', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    frbTeamId: (0, pg_core_1.varchar)('frb_team_id', { length: 50 }).notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    frbLeagueId: (0, pg_core_1.varchar)('frb_league_id', { length: 50 }).notNull(),
    leagueName: (0, pg_core_1.varchar)('league_name', { length: 255 }).notNull(),
    frbSeasonId: (0, pg_core_1.varchar)('frb_season_id', { length: 50 }).notNull(),
    seasonName: (0, pg_core_1.varchar)('season_name', { length: 255 }).notNull(),
    inviteCode: (0, pg_core_1.varchar)('invite_code', { length: 10 }).notNull().unique(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.players = (0, pg_core_1.pgTable)('players', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    name: (0, pg_core_1.varchar)('name', { length: 255 }).notNull(),
    position: (0, pg_core_1.varchar)('position', { length: 50 }),
    status: (0, pg_core_1.varchar)('status', { length: 50 }),
    avatarUrl: (0, pg_core_1.text)('avatar_url'),
    teamId: (0, pg_core_1.integer)('team_id').references(() => exports.teams.id),
});
exports.financialDocuments = (0, pg_core_1.pgTable)('financial_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(), // 'expense' or 'income'
    amount: (0, pg_core_1.integer)('amount').notNull(), // using integer for cents avoids float issues, or I can use decimal. I'll use integer.
    description: (0, pg_core_1.text)('description'),
    date: (0, pg_core_1.timestamp)('date').defaultNow().notNull(),
    documentUrl: (0, pg_core_1.text)('document_url'),
    status: (0, exports.statusEnum)('status').default('pending').notNull(),
});

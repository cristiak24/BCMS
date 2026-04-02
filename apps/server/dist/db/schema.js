"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.l12Documents = exports.events = exports.financialSettings = exports.financialDocuments = exports.playerPayments = exports.attendance = exports.playersToTeams = exports.players = exports.teams = exports.users = exports.statusEnum = exports.roleEnum = void 0;
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
    name: (0, pg_core_1.varchar)('name', { length: 255 }), // Keep old name temporarily
    firstName: (0, pg_core_1.varchar)('first_name', { length: 255 }),
    lastName: (0, pg_core_1.varchar)('last_name', { length: 255 }),
    email: (0, pg_core_1.varchar)('email', { length: 255 }),
    number: (0, pg_core_1.integer)('number'), // Jersey number
    birthYear: (0, pg_core_1.integer)('birth_year'),
    medicalCheckExpiry: (0, pg_core_1.timestamp)('medical_check_expiry'),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('active'), // active, inactive, injured
    avatarUrl: (0, pg_core_1.text)('avatar_url'),
    teamId: (0, pg_core_1.integer)('team_id').references(() => exports.teams.id), // Keep old teamId temporarily
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.playersToTeams = (0, pg_core_1.pgTable)('players_to_teams', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    playerId: (0, pg_core_1.integer)('player_id').references(() => exports.players.id).notNull(),
    teamId: (0, pg_core_1.integer)('team_id').references(() => exports.teams.id).notNull(),
});
exports.attendance = (0, pg_core_1.pgTable)('attendance', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    playerId: (0, pg_core_1.integer)('player_id').references(() => exports.players.id).notNull(),
    teamId: (0, pg_core_1.integer)('team_id').references(() => exports.teams.id).notNull(),
    eventId: (0, pg_core_1.integer)('event_id').references(() => exports.events.id),
    date: (0, pg_core_1.timestamp)('date').defaultNow().notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull(), // present, absent, late, excused
});
exports.playerPayments = (0, pg_core_1.pgTable)('player_payments', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    playerId: (0, pg_core_1.integer)('player_id').references(() => exports.players.id).notNull(),
    amount: (0, pg_core_1.integer)('amount').notNull(),
    month: (0, pg_core_1.integer)('month').notNull(),
    year: (0, pg_core_1.integer)('year').notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull(), // paid, pending, overdue
    date: (0, pg_core_1.timestamp)('date'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
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
exports.financialSettings = (0, pg_core_1.pgTable)('financial_settings', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    monthlyPlayerFee: (0, pg_core_1.integer)('monthly_player_fee').notNull().default(0), // stored in cents or basic val, let's say dollars/RON
    trainingLevy: (0, pg_core_1.integer)('training_levy').notNull().default(0), // percentage * 10 or just exact number
    facilityFee: (0, pg_core_1.integer)('facility_fee').notNull().default(0),
    autoAdjust: (0, pg_core_1.integer)('auto_adjust').notNull().default(1), // 1 for true, 0 for false
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});
exports.events = (0, pg_core_1.pgTable)('events', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    type: (0, pg_core_1.varchar)('type', { length: 50 }).notNull(), // training, match, camp, admin
    title: (0, pg_core_1.varchar)('title', { length: 255 }).notNull(),
    description: (0, pg_core_1.text)('description'),
    location: (0, pg_core_1.varchar)('location', { length: 255 }),
    startTime: (0, pg_core_1.timestamp)('start_time').notNull(),
    endTime: (0, pg_core_1.timestamp)('end_time').notNull(),
    teamId: (0, pg_core_1.integer)('team_id').references(() => exports.teams.id),
    coachId: (0, pg_core_1.integer)('coach_id').references(() => exports.users.id),
    amount: (0, pg_core_1.integer)('amount'), // for camps/tournaments
    status: (0, pg_core_1.varchar)('status', { length: 50 }).default('scheduled'), // scheduled, completed, cancelled
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});
exports.l12Documents = (0, pg_core_1.pgTable)('l12_documents', {
    id: (0, pg_core_1.serial)('id').primaryKey(),
    teamId: (0, pg_core_1.integer)('team_id').references(() => exports.teams.id).notNull(),
    matchTitle: (0, pg_core_1.varchar)('match_title', { length: 255 }).notNull(),
    documentUrl: (0, pg_core_1.text)('document_url').notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});

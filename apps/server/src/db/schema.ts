import { pgTable, serial, text, varchar, timestamp, pgEnum, integer } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['admin', 'coach', 'accountant']);
export const statusEnum = pgEnum('status', ['pending', 'processed', 'rejected']);

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    role: roleEnum('role').default('coach').notNull(),
    status: statusEnum('status').default('pending').notNull(),
});

export const teams = pgTable('teams', {
    id: serial('id').primaryKey(),
    frbTeamId: varchar('frb_team_id', { length: 50 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    frbLeagueId: varchar('frb_league_id', { length: 50 }).notNull(),
    leagueName: varchar('league_name', { length: 255 }).notNull(),
    frbSeasonId: varchar('frb_season_id', { length: 50 }).notNull(),
    seasonName: varchar('season_name', { length: 255 }).notNull(),
    inviteCode: varchar('invite_code', { length: 10 }).notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const players = pgTable('players', {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 255 }), // Keep old name temporarily
    firstName: varchar('first_name', { length: 255 }),
    lastName: varchar('last_name', { length: 255 }),
    email: varchar('email', { length: 255 }),
    number: integer('number'), // Jersey number
    birthYear: integer('birth_year'),
    medicalCheckExpiry: timestamp('medical_check_expiry'),
    status: varchar('status', { length: 50 }).default('active'), // active, inactive, injured
    avatarUrl: text('avatar_url'),
    teamId: integer('team_id').references(() => teams.id), // Keep old teamId temporarily
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const playersToTeams = pgTable('players_to_teams', {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').references(() => players.id).notNull(),
    teamId: integer('team_id').references(() => teams.id).notNull(),
});

export const attendance = pgTable('attendance', {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').references(() => players.id).notNull(),
    teamId: integer('team_id').references(() => teams.id).notNull(),
    eventId: integer('event_id').references(() => events.id),
    date: timestamp('date').defaultNow().notNull(),
    status: varchar('status', { length: 50 }).notNull(), // present, absent, late, excused
});

export const playerPayments = pgTable('player_payments', {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').references(() => players.id).notNull(),
    amount: integer('amount').notNull(),
    month: integer('month').notNull(),
    year: integer('year').notNull(),
    status: varchar('status', { length: 50 }).notNull(), // paid, pending, overdue
    date: timestamp('date'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const financialDocuments = pgTable('financial_documents', {
    id: serial('id').primaryKey(),
    type: varchar('type', { length: 50 }).notNull(), // 'expense' or 'income'
    amount: integer('amount').notNull(), // using integer for cents avoids float issues, or I can use decimal. I'll use integer.
    description: text('description'),
    date: timestamp('date').defaultNow().notNull(),
    documentUrl: text('document_url'),
    status: statusEnum('status').default('pending').notNull(),
});

export const financialSettings = pgTable('financial_settings', {
    id: serial('id').primaryKey(),
    monthlyPlayerFee: integer('monthly_player_fee').notNull().default(0), // stored in cents or basic val, let's say dollars/RON
    trainingLevy: integer('training_levy').notNull().default(0), // percentage * 10 or just exact number
    facilityFee: integer('facility_fee').notNull().default(0),
    autoAdjust: integer('auto_adjust').notNull().default(1), // 1 for true, 0 for false
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const events = pgTable('events', {
    id: serial('id').primaryKey(),
    type: varchar('type', { length: 50 }).notNull(), // training, match, camp, admin
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    location: varchar('location', { length: 255 }),
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time').notNull(),
    teamId: integer('team_id').references(() => teams.id),
    coachId: integer('coach_id').references(() => users.id),
    amount: integer('amount'), // for camps/tournaments
    status: varchar('status', { length: 50 }).default('scheduled'), // scheduled, completed, cancelled
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const l12Documents = pgTable('l12_documents', {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').references(() => teams.id).notNull(),
    matchTitle: varchar('match_title', { length: 255 }).notNull(),
    documentUrl: text('document_url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

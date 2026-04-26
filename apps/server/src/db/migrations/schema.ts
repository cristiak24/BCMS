import { pgTable, serial, varchar, integer, text, timestamp, unique, foreignKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const role = pgEnum("role", ['admin', 'coach', 'accountant'])
export const status = pgEnum("status", ['pending', 'processed', 'rejected'])


export const financialDocuments = pgTable("financial_documents", {
	id: serial().primaryKey().notNull(),
	type: varchar({ length: 50 }).notNull(),
	amount: integer().notNull(),
	description: text(),
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	documentUrl: text("document_url"),
	status: status().default('pending').notNull(),
});

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	email: varchar({ length: 255 }).notNull(),
	passwordHash: text("password_hash").notNull(),
	name: varchar({ length: 255 }).notNull(),
	role: role().default('coach').notNull(),
	status: status().default('pending').notNull(),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const players = pgTable("players", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }),
	status: varchar({ length: 50 }).default('active'),
	avatarUrl: text("avatar_url"),
	teamId: integer("team_id"),
	firstName: varchar("first_name", { length: 255 }),
	lastName: varchar("last_name", { length: 255 }),
	number: integer(),
	birthYear: integer("birth_year"),
	medicalCheckExpiry: timestamp("medical_check_expiry", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	email: varchar({ length: 255 }),
}, (table) => [
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "players_team_id_teams_id_fk"
		}),
]);

export const teams = pgTable("teams", {
	id: serial().primaryKey().notNull(),
	frbTeamId: varchar("frb_team_id", { length: 50 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	frbLeagueId: varchar("frb_league_id", { length: 50 }).notNull(),
	leagueName: varchar("league_name", { length: 255 }).notNull(),
	frbSeasonId: varchar("frb_season_id", { length: 50 }).notNull(),
	seasonName: varchar("season_name", { length: 255 }).notNull(),
	inviteCode: varchar("invite_code", { length: 10 }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("teams_invite_code_unique").on(table.inviteCode),
]);

export const playerPayments = pgTable("player_payments", {
	id: serial().primaryKey().notNull(),
	playerId: integer("player_id").notNull(),
	amount: integer().notNull(),
	month: integer().notNull(),
	year: integer().notNull(),
	status: varchar({ length: 50 }).notNull(),
	date: timestamp({ mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "player_payments_player_id_players_id_fk"
		}),
]);

export const playersToTeams = pgTable("players_to_teams", {
	id: serial().primaryKey().notNull(),
	playerId: integer("player_id").notNull(),
	teamId: integer("team_id").notNull(),
}, (table) => [
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "players_to_teams_player_id_players_id_fk"
		}),
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "players_to_teams_team_id_teams_id_fk"
		}),
]);

export const financialSettings = pgTable("financial_settings", {
	id: serial().primaryKey().notNull(),
	monthlyPlayerFee: integer("monthly_player_fee").default(0).notNull(),
	trainingLevy: integer("training_levy").default(0).notNull(),
	facilityFee: integer("facility_fee").default(0).notNull(),
	autoAdjust: integer("auto_adjust").default(1).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const events = pgTable("events", {
	id: serial().primaryKey().notNull(),
	type: varchar({ length: 50 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text(),
	location: varchar({ length: 255 }),
	startTime: timestamp("start_time", { mode: 'string' }).notNull(),
	endTime: timestamp("end_time", { mode: 'string' }).notNull(),
	teamId: integer("team_id"),
	coachId: integer("coach_id"),
	amount: integer(),
	status: varchar({ length: 50 }).default('scheduled'),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "events_team_id_teams_id_fk"
		}),
	foreignKey({
			columns: [table.coachId],
			foreignColumns: [users.id],
			name: "events_coach_id_users_id_fk"
		}),
]);

export const attendance = pgTable("attendance", {
	id: serial().primaryKey().notNull(),
	playerId: integer("player_id").notNull(),
	teamId: integer("team_id").notNull(),
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	status: varchar({ length: 50 }).notNull(),
	eventId: integer("event_id"),
}, (table) => [
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "attendance_player_id_players_id_fk"
		}),
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "attendance_team_id_teams_id_fk"
		}),
	foreignKey({
			columns: [table.eventId],
			foreignColumns: [events.id],
			name: "attendance_event_id_events_id_fk"
		}),
]);

export const l12Documents = pgTable("l12_documents", {
	id: serial().primaryKey().notNull(),
	teamId: integer("team_id").notNull(),
	matchTitle: varchar("match_title", { length: 255 }).notNull(),
	documentUrl: text("document_url").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "l12_documents_team_id_teams_id_fk"
		}),
]);

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
	name: varchar({ length: 255 }).notNull(),
	position: varchar({ length: 50 }),
	status: varchar({ length: 50 }),
	avatarUrl: text("avatar_url"),
	teamId: integer("team_id"),
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

import { pgTable, serial, varchar, integer, text, timestamp, unique, foreignKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const role = pgEnum("role", ['admin', 'coach', 'accountant', 'player', 'parent', 'staff', 'superadmin'])
export const status = pgEnum("status", ['pending', 'processed', 'rejected'])
export const userStatus = pgEnum("user_status", ['active', 'pending', 'disabled'])
export const accessRequestStatus = pgEnum("access_request_status", ['pending', 'approved', 'denied'])
export const inviteStatus = pgEnum("invite_status", ['pending', 'accepted', 'expired', 'revoked'])



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
	uid: varchar({ length: 255 }), // Keep for backwards compatibility
	firebaseUid: varchar("firebase_uid", { length: 255 }),
	email: varchar({ length: 255 }).notNull(),
	passwordHash: text("password_hash"),
	name: varchar({ length: 255 }).notNull(),
	firstName: varchar("first_name", { length: 255 }),
	lastName: varchar("last_name", { length: 255 }),
	role: role().default('coach').notNull(),
	status: userStatus().default('pending').notNull(),
	clubId: integer("club_id"),
	avatarUrl: text("avatar_url"),
	phone: varchar({ length: 50 }),
	preferredLanguage: varchar("preferred_language", { length: 50 }),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("users_email_unique").on(table.email),
	unique("users_firebase_uid_unique").on(table.firebaseUid),
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
	clubId: integer("club_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("teams_invite_code_unique").on(table.inviteCode),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "teams_club_id_clubs_id_fk"
		}),
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

export const clubs = pgTable("clubs", {
	id: serial().primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	normalizedName: varchar("normalized_name", { length: 255 }),
	createdBy: varchar("created_by", { length: 255 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("clubs_normalized_name_unique").on(table.normalizedName),
]);
export const accessRequests = pgTable("access_requests", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	clubId: integer("club_id").notNull(),
	userName: varchar("user_name", { length: 255 }),
	userEmail: varchar("user_email", { length: 255 }),
	requestedRole: role("requested_role").notNull(),
	status: accessRequestStatus().default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	reviewedBy: integer("reviewed_by"),
});

export const inviteLinks = pgTable("invite_links", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	role: role().notNull(),
	token: varchar({ length: 255 }).notNull(),
	tokenHash: varchar("token_hash", { length: 255 }).notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	refreshIntervalMinutes: integer("refresh_interval_minutes").notNull(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	isActive: integer("is_active").default(1).notNull(),
});

export const invites = pgTable("invites", {
	id: serial().primaryKey().notNull(),
	token: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	role: role().notNull(),
	clubId: integer("club_id"),
	tokenHash: varchar("token_hash", { length: 255 }).notNull(),
	status: inviteStatus().default('pending').notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdBy: integer("created_by"),
	usedBy: integer("used_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	usedAt: timestamp("used_at", { mode: 'string' }),
}, (table) => [
	unique("invites_token_unique").on(table.token),
	unique("invites_token_hash_unique").on(table.tokenHash),
	foreignKey({
		columns: [table.clubId],
		foreignColumns: [clubs.id],
		name: "invites_club_id_clubs_id_fk"
	}),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [users.id],
		name: "invites_created_by_users_id_fk"
	}),
	foreignKey({
		columns: [table.usedBy],
		foreignColumns: [users.id],
		name: "invites_used_by_users_id_fk"
	}),
]);

export const auditLogs = pgTable("audit_logs", {
	id: serial().primaryKey().notNull(),
	action: varchar({ length: 120 }).notNull(),
	entityType: varchar("entity_type", { length: 80 }).notNull(),
	entityId: varchar("entity_id", { length: 120 }),
	actorUserId: integer("actor_user_id"),
	actorUid: varchar("actor_uid", { length: 255 }),
	actorRole: role("actor_role"),
	clubId: integer("club_id"),
	metadata: text(),
	ipAddress: varchar("ip_address", { length: 120 }),
	userAgent: text("user_agent"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.actorUserId],
		foreignColumns: [users.id],
		name: "audit_logs_actor_user_id_users_id_fk",
	}),
	foreignKey({
		columns: [table.clubId],
		foreignColumns: [clubs.id],
		name: "audit_logs_club_id_clubs_id_fk",
	}),
]);

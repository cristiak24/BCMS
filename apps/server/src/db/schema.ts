import { pgTable, serial, varchar, integer, text, timestamp, unique, foreignKey, pgEnum, boolean, jsonb, customType, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return "bytea";
	},
});

export const role = pgEnum("role", ['admin', 'coach', 'accountant', 'player', 'parent', 'staff', 'superadmin'])
export const status = pgEnum("status", ['pending', 'processed', 'rejected'])
export const userStatus = pgEnum("user_status", ['active', 'pending', 'disabled'])
export const accessRequestStatus = pgEnum("access_request_status", ['pending', 'approved', 'denied'])
export const inviteStatus = pgEnum("invite_status", ['pending', 'accepted', 'expired', 'revoked'])
export const teamGender = pgEnum("team_gender", ['M', 'F'])
export const teamLevel = pgEnum("team_level", ['national', 'municipal', 'initiere'])



export const financialDocuments = pgTable("financial_documents", {
	id: serial().primaryKey().notNull(),
	type: varchar({ length: 50 }).notNull(),
	amount: integer().notNull(),
	description: text(),
	date: timestamp({ mode: 'string' }).defaultNow().notNull(),
	documentUrl: text("document_url"),
	status: status().default('pending').notNull(),
	clubId: integer("club_id"),
}, (table) => [
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "financial_documents_club_id_clubs_id_fk"
		}),
]);

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
	// Contact book (routes/contacts.ts): the player's own number and up to two
	// parents/guardians, so staff can reach a family fast. Staff-only data.
	phone: varchar({ length: 32 }),
	guardianName: varchar("guardian_name", { length: 120 }),
	guardianPhone: varchar("guardian_phone", { length: 32 }),
	guardian2Name: varchar("guardian2_name", { length: 120 }),
	guardian2Phone: varchar("guardian2_phone", { length: 32 }),
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
	gender: teamGender(),
	level: teamLevel(),
	coachId: integer("coach_id"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("teams_invite_code_unique").on(table.inviteCode),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "teams_club_id_clubs_id_fk"
		}),
	foreignKey({
			columns: [table.coachId],
			foreignColumns: [users.id],
			name: "teams_coach_id_users_id_fk"
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
	// Account that paid online (the player or a linked parent). Null for
	// payments the club recorded by hand. No FK: a deleted account must not
	// block or erase the payment history.
	paidByUserId: integer("paid_by_user_id"),
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
	paymentDueDay: integer("payment_due_day").default(25).notNull(),
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
	// Shared note from the coach on this event, visible to every player on it
	// (post-session feedback, focus points, MVP shoutout).
	coachNote: text("coach_note"),
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
	// Per-player coach feedback for the session (optional free-text note).
	note: text("note"),
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

export const notifications = pgTable("notifications", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	type: varchar({ length: 50 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	message: text().notNull(),
	eventId: integer("event_id"),
	playerId: integer("player_id"),
	isRead: boolean("is_read").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notifications_user_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.eventId],
			foreignColumns: [events.id],
			name: "notifications_event_id_events_id_fk"
		}),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "notifications_player_id_players_id_fk"
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

// Formular L-12 ("Lista oficială a echipei pentru joc"). One row per match
// (event_id set) plus at most one per team with event_id NULL: the team's
// "L12 constant", the default every new match sheet starts from. Players and
// staff are snapshots (JSON), not references — a filed sheet must not change
// when a player's shirt number is edited later. Shapes: see routes/l12.ts.
export const l12Lineups = pgTable("l12_lineups", {
	id: serial().primaryKey().notNull(),
	teamId: integer("team_id").notNull(),
	eventId: integer("event_id"),
	competition: varchar({ length: 255 }),
	gender: varchar({ length: 1 }),
	players: jsonb().default([]).notNull(),
	staff: jsonb().default({}).notNull(),
	captainPlayerId: integer("captain_player_id"),
	updatedBy: integer("updated_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("l12_lineups_event_id_unique").on(table.eventId),
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "l12_lineups_team_id_teams_id_fk"
		}),
	foreignKey({
			columns: [table.eventId],
			foreignColumns: [events.id],
			name: "l12_lineups_event_id_events_id_fk"
		}).onDelete('cascade'),
]);

// Parent/guardian accounts linked to a player record. Created when a club
// admin or the team's coach approves a family_join_request (or links a parent
// by hand). A player can have several guardians; a parent several children.
export const playerGuardians = pgTable("player_guardians", {
	id: serial().primaryKey().notNull(),
	playerId: integer("player_id").notNull(),
	userId: integer("user_id").notNull(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("player_guardians_player_user_unique").on(table.playerId, table.userId),
	index("player_guardians_user_id_idx").on(table.userId),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "player_guardians_player_id_players_id_fk"
		}).onDelete('cascade'),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "player_guardians_user_id_users_id_fk"
		}).onDelete('cascade'),
]);

// Personal, single-use invite for one parent of one player, made by a club
// admin or the player's coach from the player's page. Accepting it links the
// new (or signed-in) parent account to that child without a further approval.
// Only the SHA-256 of the token is stored.
export const guardianInvites = pgTable("guardian_invites", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	playerId: integer("player_id").notNull(),
	tokenHash: varchar("token_hash", { length: 64 }).notNull(),
	createdBy: integer("created_by"),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	usedAt: timestamp("used_at", { mode: 'string' }),
	usedBy: integer("used_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("guardian_invites_token_hash_unique").on(table.tokenHash),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "guardian_invites_player_id_players_id_fk"
		}).onDelete('cascade'),
]);

// Signups made with a team's join code (teams.invite_code). One row per child
// a parent registers (kind 'parent') or per player registering themselves
// (kind 'player'). Nothing touches the roster until a club admin or that
// team's coach approves — approval links to an existing player or creates one.
export const familyJoinRequests = pgTable("family_join_requests", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	teamId: integer("team_id").notNull(),
	userId: integer("user_id").notNull(),
	kind: varchar({ length: 10 }).notNull(),
	childFirstName: varchar("child_first_name", { length: 120 }).notNull(),
	childLastName: varchar("child_last_name", { length: 120 }).notNull(),
	childBirthDate: varchar("child_birth_date", { length: 10 }),
	status: varchar({ length: 10 }).default('pending').notNull(),
	playerId: integer("player_id"),
	reviewedBy: integer("reviewed_by"),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("family_join_requests_team_status_idx").on(table.teamId, table.status),
	foreignKey({
			columns: [table.teamId],
			foreignColumns: [teams.id],
			name: "family_join_requests_team_id_teams_id_fk"
		}).onDelete('cascade'),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "family_join_requests_user_id_users_id_fk"
		}).onDelete('cascade'),
	foreignKey({
			columns: [table.playerId],
			foreignColumns: [players.id],
			name: "family_join_requests_player_id_players_id_fk"
		}).onDelete('set null'),
]);

// Club document library (small PDFs: regulations, forms, schedules). The file
// bytes live in Postgres on purpose — the API host has no persistent disk, so
// anything written to ./uploads disappears on the next deploy. Size limits are
// enforced in routes/clubDocuments.ts. Never select `data` in a listing.
export const clubDocuments = pgTable("club_documents", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	title: varchar({ length: 200 }).notNull(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	mimeType: varchar("mime_type", { length: 100 }).notNull(),
	sizeBytes: integer("size_bytes").notNull(),
	data: bytea().notNull(),
	// 'all' = every member of the club; 'staff' = admins and coaches only.
	visibility: varchar({ length: 10 }).default('all').notNull(),
	uploadedBy: integer("uploaded_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("club_documents_club_id_idx").on(table.clubId),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "club_documents_club_id_clubs_id_fk"
		}),
	foreignKey({
			columns: [table.uploadedBy],
			foreignColumns: [users.id],
			name: "club_documents_uploaded_by_users_id_fk"
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

// Short, shareable club join codes (e.g. "K7M4-QX2P"). The admin sets the role,
// expiry and a usage cap; each successful signup consumes one use atomically.
export const clubInviteCodes = pgTable("club_invite_codes", {
	id: serial().primaryKey().notNull(),
	clubId: integer("club_id").notNull(),
	code: varchar({ length: 16 }).notNull(),
	role: role().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	maxUses: integer("max_uses").notNull(),
	useCount: integer("use_count").default(0).notNull(),
	createdBy: integer("created_by"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	revokedAt: timestamp("revoked_at", { mode: 'string' }),
}, (table) => [
	unique("club_invite_codes_code_unique").on(table.code),
	foreignKey({
			columns: [table.clubId],
			foreignColumns: [clubs.id],
			name: "club_invite_codes_club_id_clubs_id_fk"
		}),
]);

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

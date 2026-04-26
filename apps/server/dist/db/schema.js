"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invites = exports.inviteLinks = exports.accessRequests = exports.clubs = exports.l12Documents = exports.attendance = exports.events = exports.financialSettings = exports.playersToTeams = exports.playerPayments = exports.teams = exports.players = exports.users = exports.financialDocuments = exports.inviteStatus = exports.accessRequestStatus = exports.userStatus = exports.status = exports.role = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.role = (0, pg_core_1.pgEnum)("role", ['admin', 'coach', 'accountant', 'player', 'parent', 'superadmin']);
exports.status = (0, pg_core_1.pgEnum)("status", ['pending', 'processed', 'rejected']);
exports.userStatus = (0, pg_core_1.pgEnum)("user_status", ['active', 'pending', 'disabled']);
exports.accessRequestStatus = (0, pg_core_1.pgEnum)("access_request_status", ['pending', 'approved', 'denied']);
exports.inviteStatus = (0, pg_core_1.pgEnum)("invite_status", ['active', 'used', 'expired', 'revoked']);
exports.financialDocuments = (0, pg_core_1.pgTable)("financial_documents", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    type: (0, pg_core_1.varchar)({ length: 50 }).notNull(),
    amount: (0, pg_core_1.integer)().notNull(),
    description: (0, pg_core_1.text)(),
    date: (0, pg_core_1.timestamp)({ mode: 'string' }).defaultNow().notNull(),
    documentUrl: (0, pg_core_1.text)("document_url"),
    status: (0, exports.status)().default('pending').notNull(),
});
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    uid: (0, pg_core_1.varchar)({ length: 255 }), // Keep for backwards compatibility
    firebaseUid: (0, pg_core_1.varchar)("firebase_uid", { length: 255 }),
    email: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    passwordHash: (0, pg_core_1.text)("password_hash"),
    name: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    firstName: (0, pg_core_1.varchar)("first_name", { length: 255 }),
    lastName: (0, pg_core_1.varchar)("last_name", { length: 255 }),
    role: (0, exports.role)().default('coach').notNull(),
    status: (0, exports.userStatus)().default('pending').notNull(),
    clubId: (0, pg_core_1.integer)("club_id"),
    avatarUrl: (0, pg_core_1.text)("avatar_url"),
    phone: (0, pg_core_1.varchar)({ length: 50 }),
    preferredLanguage: (0, pg_core_1.varchar)("preferred_language", { length: 50 }),
    lastLoginAt: (0, pg_core_1.timestamp)("last_login_at", { mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.unique)("users_email_unique").on(table.email),
    (0, pg_core_1.unique)("users_firebase_uid_unique").on(table.firebaseUid),
]);
exports.players = (0, pg_core_1.pgTable)("players", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    name: (0, pg_core_1.varchar)({ length: 255 }),
    status: (0, pg_core_1.varchar)({ length: 50 }).default('active'),
    avatarUrl: (0, pg_core_1.text)("avatar_url"),
    teamId: (0, pg_core_1.integer)("team_id"),
    firstName: (0, pg_core_1.varchar)("first_name", { length: 255 }),
    lastName: (0, pg_core_1.varchar)("last_name", { length: 255 }),
    number: (0, pg_core_1.integer)(),
    birthYear: (0, pg_core_1.integer)("birth_year"),
    medicalCheckExpiry: (0, pg_core_1.timestamp)("medical_check_expiry", { mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    email: (0, pg_core_1.varchar)({ length: 255 }),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.teamId],
        foreignColumns: [exports.teams.id],
        name: "players_team_id_teams_id_fk"
    }),
]);
exports.teams = (0, pg_core_1.pgTable)("teams", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    frbTeamId: (0, pg_core_1.varchar)("frb_team_id", { length: 50 }).notNull(),
    name: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    frbLeagueId: (0, pg_core_1.varchar)("frb_league_id", { length: 50 }).notNull(),
    leagueName: (0, pg_core_1.varchar)("league_name", { length: 255 }).notNull(),
    frbSeasonId: (0, pg_core_1.varchar)("frb_season_id", { length: 50 }).notNull(),
    seasonName: (0, pg_core_1.varchar)("season_name", { length: 255 }).notNull(),
    inviteCode: (0, pg_core_1.varchar)("invite_code", { length: 10 }).notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.unique)("teams_invite_code_unique").on(table.inviteCode),
]);
exports.playerPayments = (0, pg_core_1.pgTable)("player_payments", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    playerId: (0, pg_core_1.integer)("player_id").notNull(),
    amount: (0, pg_core_1.integer)().notNull(),
    month: (0, pg_core_1.integer)().notNull(),
    year: (0, pg_core_1.integer)().notNull(),
    status: (0, pg_core_1.varchar)({ length: 50 }).notNull(),
    date: (0, pg_core_1.timestamp)({ mode: 'string' }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.playerId],
        foreignColumns: [exports.players.id],
        name: "player_payments_player_id_players_id_fk"
    }),
]);
exports.playersToTeams = (0, pg_core_1.pgTable)("players_to_teams", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    playerId: (0, pg_core_1.integer)("player_id").notNull(),
    teamId: (0, pg_core_1.integer)("team_id").notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.playerId],
        foreignColumns: [exports.players.id],
        name: "players_to_teams_player_id_players_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.teamId],
        foreignColumns: [exports.teams.id],
        name: "players_to_teams_team_id_teams_id_fk"
    }),
]);
exports.financialSettings = (0, pg_core_1.pgTable)("financial_settings", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    monthlyPlayerFee: (0, pg_core_1.integer)("monthly_player_fee").default(0).notNull(),
    trainingLevy: (0, pg_core_1.integer)("training_levy").default(0).notNull(),
    facilityFee: (0, pg_core_1.integer)("facility_fee").default(0).notNull(),
    autoAdjust: (0, pg_core_1.integer)("auto_adjust").default(1).notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
});
exports.events = (0, pg_core_1.pgTable)("events", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    type: (0, pg_core_1.varchar)({ length: 50 }).notNull(),
    title: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    description: (0, pg_core_1.text)(),
    location: (0, pg_core_1.varchar)({ length: 255 }),
    startTime: (0, pg_core_1.timestamp)("start_time", { mode: 'string' }).notNull(),
    endTime: (0, pg_core_1.timestamp)("end_time", { mode: 'string' }).notNull(),
    teamId: (0, pg_core_1.integer)("team_id"),
    coachId: (0, pg_core_1.integer)("coach_id"),
    amount: (0, pg_core_1.integer)(),
    status: (0, pg_core_1.varchar)({ length: 50 }).default('scheduled'),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.teamId],
        foreignColumns: [exports.teams.id],
        name: "events_team_id_teams_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.coachId],
        foreignColumns: [exports.users.id],
        name: "events_coach_id_users_id_fk"
    }),
]);
exports.attendance = (0, pg_core_1.pgTable)("attendance", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    playerId: (0, pg_core_1.integer)("player_id").notNull(),
    teamId: (0, pg_core_1.integer)("team_id").notNull(),
    date: (0, pg_core_1.timestamp)({ mode: 'string' }).defaultNow().notNull(),
    status: (0, pg_core_1.varchar)({ length: 50 }).notNull(),
    eventId: (0, pg_core_1.integer)("event_id"),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.playerId],
        foreignColumns: [exports.players.id],
        name: "attendance_player_id_players_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.teamId],
        foreignColumns: [exports.teams.id],
        name: "attendance_team_id_teams_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.eventId],
        foreignColumns: [exports.events.id],
        name: "attendance_event_id_events_id_fk"
    }),
]);
exports.l12Documents = (0, pg_core_1.pgTable)("l12_documents", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    teamId: (0, pg_core_1.integer)("team_id").notNull(),
    matchTitle: (0, pg_core_1.varchar)("match_title", { length: 255 }).notNull(),
    documentUrl: (0, pg_core_1.text)("document_url").notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.foreignKey)({
        columns: [table.teamId],
        foreignColumns: [exports.teams.id],
        name: "l12_documents_team_id_teams_id_fk"
    }),
]);
exports.clubs = (0, pg_core_1.pgTable)("clubs", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    name: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    normalizedName: (0, pg_core_1.varchar)("normalized_name", { length: 255 }),
    createdBy: (0, pg_core_1.varchar)("created_by", { length: 255 }),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
    (0, pg_core_1.unique)("clubs_normalized_name_unique").on(table.normalizedName),
]);
exports.accessRequests = (0, pg_core_1.pgTable)("access_requests", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    userId: (0, pg_core_1.integer)("user_id").notNull(),
    clubId: (0, pg_core_1.integer)("club_id").notNull(),
    userName: (0, pg_core_1.varchar)("user_name", { length: 255 }),
    userEmail: (0, pg_core_1.varchar)("user_email", { length: 255 }),
    requestedRole: (0, exports.role)("requested_role").notNull(),
    status: (0, exports.accessRequestStatus)().default('pending').notNull(),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    reviewedAt: (0, pg_core_1.timestamp)("reviewed_at", { mode: 'string' }),
    reviewedBy: (0, pg_core_1.integer)("reviewed_by"),
});
exports.inviteLinks = (0, pg_core_1.pgTable)("invite_links", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    clubId: (0, pg_core_1.integer)("club_id").notNull(),
    role: (0, exports.role)().notNull(),
    token: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    tokenHash: (0, pg_core_1.varchar)("token_hash", { length: 255 }).notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { mode: 'string' }).notNull(),
    refreshIntervalMinutes: (0, pg_core_1.integer)("refresh_interval_minutes").notNull(),
    createdBy: (0, pg_core_1.integer)("created_by"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    isActive: (0, pg_core_1.integer)("is_active").default(1).notNull(),
});
exports.invites = (0, pg_core_1.pgTable)("invites", {
    id: (0, pg_core_1.serial)().primaryKey().notNull(),
    email: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    role: (0, exports.role)().notNull(),
    clubId: (0, pg_core_1.integer)("club_id"),
    tokenHash: (0, pg_core_1.varchar)("token_hash", { length: 255 }).notNull(),
    status: (0, exports.inviteStatus)().default('active').notNull(),
    expiresAt: (0, pg_core_1.timestamp)("expires_at", { mode: 'string' }).notNull(),
    createdBy: (0, pg_core_1.integer)("created_by"),
    usedBy: (0, pg_core_1.integer)("used_by"),
    createdAt: (0, pg_core_1.timestamp)("created_at", { mode: 'string' }).defaultNow().notNull(),
    usedAt: (0, pg_core_1.timestamp)("used_at", { mode: 'string' }),
}, (table) => [
    (0, pg_core_1.unique)("invites_token_hash_unique").on(table.tokenHash),
    (0, pg_core_1.foreignKey)({
        columns: [table.clubId],
        foreignColumns: [exports.clubs.id],
        name: "invites_club_id_clubs_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.createdBy],
        foreignColumns: [exports.users.id],
        name: "invites_created_by_users_id_fk"
    }),
    (0, pg_core_1.foreignKey)({
        columns: [table.usedBy],
        foreignColumns: [exports.users.id],
        name: "invites_used_by_users_id_fk"
    }),
]);

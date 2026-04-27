"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.l12Documents = exports.attendance = exports.events = exports.financialSettings = exports.playersToTeams = exports.playerPayments = exports.teams = exports.players = exports.users = exports.financialDocuments = exports.status = exports.role = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.role = (0, pg_core_1.pgEnum)("role", ['admin', 'coach', 'accountant']);
exports.status = (0, pg_core_1.pgEnum)("status", ['pending', 'processed', 'rejected']);
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
    email: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    passwordHash: (0, pg_core_1.text)("password_hash").notNull(),
    name: (0, pg_core_1.varchar)({ length: 255 }).notNull(),
    role: (0, exports.role)().default('coach').notNull(),
    status: (0, exports.status)().default('pending').notNull(),
}, (table) => [
    (0, pg_core_1.unique)("users_email_unique").on(table.email),
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

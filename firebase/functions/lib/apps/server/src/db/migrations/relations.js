"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.l12DocumentsRelations = exports.attendanceRelations = exports.usersRelations = exports.eventsRelations = exports.playersToTeamsRelations = exports.playerPaymentsRelations = exports.teamsRelations = exports.playersRelations = void 0;
const relations_1 = require("drizzle-orm/relations");
const schema_1 = require("./schema");
exports.playersRelations = (0, relations_1.relations)(schema_1.players, ({ one, many }) => ({
    team: one(schema_1.teams, {
        fields: [schema_1.players.teamId],
        references: [schema_1.teams.id]
    }),
    playerPayments: many(schema_1.playerPayments),
    playersToTeams: many(schema_1.playersToTeams),
    attendances: many(schema_1.attendance),
}));
exports.teamsRelations = (0, relations_1.relations)(schema_1.teams, ({ many }) => ({
    players: many(schema_1.players),
    playersToTeams: many(schema_1.playersToTeams),
    events: many(schema_1.events),
    attendances: many(schema_1.attendance),
    l12Documents: many(schema_1.l12Documents),
}));
exports.playerPaymentsRelations = (0, relations_1.relations)(schema_1.playerPayments, ({ one }) => ({
    player: one(schema_1.players, {
        fields: [schema_1.playerPayments.playerId],
        references: [schema_1.players.id]
    }),
}));
exports.playersToTeamsRelations = (0, relations_1.relations)(schema_1.playersToTeams, ({ one }) => ({
    player: one(schema_1.players, {
        fields: [schema_1.playersToTeams.playerId],
        references: [schema_1.players.id]
    }),
    team: one(schema_1.teams, {
        fields: [schema_1.playersToTeams.teamId],
        references: [schema_1.teams.id]
    }),
}));
exports.eventsRelations = (0, relations_1.relations)(schema_1.events, ({ one, many }) => ({
    team: one(schema_1.teams, {
        fields: [schema_1.events.teamId],
        references: [schema_1.teams.id]
    }),
    user: one(schema_1.users, {
        fields: [schema_1.events.coachId],
        references: [schema_1.users.id]
    }),
    attendances: many(schema_1.attendance),
}));
exports.usersRelations = (0, relations_1.relations)(schema_1.users, ({ many }) => ({
    events: many(schema_1.events),
}));
exports.attendanceRelations = (0, relations_1.relations)(schema_1.attendance, ({ one }) => ({
    player: one(schema_1.players, {
        fields: [schema_1.attendance.playerId],
        references: [schema_1.players.id]
    }),
    team: one(schema_1.teams, {
        fields: [schema_1.attendance.teamId],
        references: [schema_1.teams.id]
    }),
    event: one(schema_1.events, {
        fields: [schema_1.attendance.eventId],
        references: [schema_1.events.id]
    }),
}));
exports.l12DocumentsRelations = (0, relations_1.relations)(schema_1.l12Documents, ({ one }) => ({
    team: one(schema_1.teams, {
        fields: [schema_1.l12Documents.teamId],
        references: [schema_1.teams.id]
    }),
}));

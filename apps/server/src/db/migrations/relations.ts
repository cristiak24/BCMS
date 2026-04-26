import { relations } from "drizzle-orm/relations";
import { teams, players, playerPayments, playersToTeams, events, users, attendance, l12Documents } from "./schema";

export const playersRelations = relations(players, ({one, many}) => ({
	team: one(teams, {
		fields: [players.teamId],
		references: [teams.id]
	}),
	playerPayments: many(playerPayments),
	playersToTeams: many(playersToTeams),
	attendances: many(attendance),
}));

export const teamsRelations = relations(teams, ({many}) => ({
	players: many(players),
	playersToTeams: many(playersToTeams),
	events: many(events),
	attendances: many(attendance),
	l12Documents: many(l12Documents),
}));

export const playerPaymentsRelations = relations(playerPayments, ({one}) => ({
	player: one(players, {
		fields: [playerPayments.playerId],
		references: [players.id]
	}),
}));

export const playersToTeamsRelations = relations(playersToTeams, ({one}) => ({
	player: one(players, {
		fields: [playersToTeams.playerId],
		references: [players.id]
	}),
	team: one(teams, {
		fields: [playersToTeams.teamId],
		references: [teams.id]
	}),
}));

export const eventsRelations = relations(events, ({one, many}) => ({
	team: one(teams, {
		fields: [events.teamId],
		references: [teams.id]
	}),
	user: one(users, {
		fields: [events.coachId],
		references: [users.id]
	}),
	attendances: many(attendance),
}));

export const usersRelations = relations(users, ({many}) => ({
	events: many(events),
}));

export const attendanceRelations = relations(attendance, ({one}) => ({
	player: one(players, {
		fields: [attendance.playerId],
		references: [players.id]
	}),
	team: one(teams, {
		fields: [attendance.teamId],
		references: [teams.id]
	}),
	event: one(events, {
		fields: [attendance.eventId],
		references: [events.id]
	}),
}));

export const l12DocumentsRelations = relations(l12Documents, ({one}) => ({
	team: one(teams, {
		fields: [l12Documents.teamId],
		references: [teams.id]
	}),
}));
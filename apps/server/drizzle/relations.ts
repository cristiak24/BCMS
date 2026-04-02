import { relations } from "drizzle-orm/relations";
import { teams, players } from "./schema";

export const playersRelations = relations(players, ({one}) => ({
	team: one(teams, {
		fields: [players.teamId],
		references: [teams.id]
	}),
}));

export const teamsRelations = relations(teams, ({many}) => ({
	players: many(players),
}));
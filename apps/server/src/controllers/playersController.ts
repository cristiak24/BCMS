import { Request, Response } from 'express';
import { db } from '../db';
import { players, teams, playersToTeams, attendance, playerPayments } from '../db/schema';
import { eq, or, ilike, and, desc } from 'drizzle-orm';

export const playersController = {
    async searchPlayers(req: Request, res: Response) {
        try {
            const { query } = req.query;
            if (!query || typeof query !== 'string') {
                return res.status(400).json({ error: 'Search query is required' });
            }

            const results = await db.select()
                .from(players)
                .where(
                    or(
                        ilike(players.firstName, `%${query}%`),
                        ilike(players.lastName, `%${query}%`)
                    )
                )
                .limit(10);

            res.json(results);
        } catch (error) {
            console.error('Search players error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getRoster(req: Request, res: Response) {
        try {
            // Get all players with their teams
            const allPlayers = await db.select({
                id: players.id,
                name: players.name,
                firstName: players.firstName,
                lastName: players.lastName,
                number: players.number,
                status: players.status,
                avatarUrl: players.avatarUrl,
                medicalCheckExpiry: players.medicalCheckExpiry,
                birthYear: players.birthYear,
                email: players.email,
            }).from(players);

            const rosterWithData = await Promise.all(allPlayers.map(async (player) => {
                // Ensure firstName and lastName are not null for the UI
                const firstName = player.firstName || player.name?.split(' ')[0] || 'Unknown';
                const lastName = player.lastName || player.name?.split(' ').slice(1).join(' ') || 'Player';

                // Get teams for this player to find the "highest" category
                const playerTeams = await db.select({
                    name: teams.name,
                    leagueName: teams.leagueName
                })
                .from(playersToTeams)
                .innerJoin(teams, eq(playersToTeams.teamId, teams.id))
                .where(eq(playersToTeams.playerId, player.id));

                // Find highest category
                const category = playerTeams.length > 0 
                    ? playerTeams.sort((a, b) => b.name.localeCompare(a.name))[0].name 
                    : 'N/A';

                // Get attendance stats
                const playerAttendance = await db.select()
                    .from(attendance)
                    .where(eq(attendance.playerId, player.id));
                
                const attended = playerAttendance.filter(a => a.status === 'present').length;
                const total = playerAttendance.length;
                const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 100;

                // Get latest payment status
                const latestPayment = await db.select()
                    .from(playerPayments)
                    .where(eq(playerPayments.playerId, player.id))
                    .orderBy(desc(playerPayments.year), desc(playerPayments.month))
                    .limit(1);

                const paymentStatus = latestPayment.length > 0 ? latestPayment[0].status : 'Pending';

                return {
                    ...player,
                    firstName,
                    lastName,
                    category,
                    attendanceRate,
                    paymentStatus
                };
            }));

            res.json(rosterWithData);
        } catch (error) {
            console.error('Get roster error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async addPlayerToTeam(req: Request, res: Response) {
        try {
            const { playerId, teamId } = req.body;
            if (!playerId || !teamId) {
                return res.status(400).json({ error: 'playerId and teamId are required' });
            }

            const result = await db.insert(playersToTeams).values({
                playerId,
                teamId
            }).returning();

            res.json(result[0]);
        } catch (error) {
            console.error('Add player to team error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async updatePlayer(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const updateData = { ...req.body };

            // Parse timestamp strings to Date objects for Drizzle
            if (updateData.medicalCheckExpiry) {
                updateData.medicalCheckExpiry = new Date(updateData.medicalCheckExpiry);
            }
            if (updateData.createdAt) {
                updateData.createdAt = new Date(updateData.createdAt);
            }

            const result = await db.update(players)
                .set(updateData)
                .where(eq(players.id, parseInt(id as string)))
                .returning();

            res.json(result[0]);
        } catch (error) {
            console.error('Update player error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },

    async getPlayerById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const result = await db.select({
                id: players.id,
                firstName: players.firstName,
                lastName: players.lastName,
                email: players.email,
                number: players.number,
                birthYear: players.birthYear,
                status: players.status,
                avatarUrl: players.avatarUrl,
                medicalCheckExpiry: players.medicalCheckExpiry,
            })
            .from(players)
            .where(eq(players.id, parseInt(id as string)))
            .limit(1);
            
            if (result.length === 0) {
                return res.status(404).json({ error: 'Player not found' });
            }
            res.json(result[0]);
        } catch (error) {
            console.error('Get player by id error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }
};

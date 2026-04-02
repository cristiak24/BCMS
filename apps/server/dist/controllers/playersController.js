"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.playersController = void 0;
const db_1 = require("../db");
const schema_1 = require("../db/schema");
const drizzle_orm_1 = require("drizzle-orm");
exports.playersController = {
    searchPlayers(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { query } = req.query;
                if (!query || typeof query !== 'string') {
                    return res.status(400).json({ error: 'Search query is required' });
                }
                const results = yield db_1.db.select()
                    .from(schema_1.players)
                    .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.players.firstName, `%${query}%`), (0, drizzle_orm_1.ilike)(schema_1.players.lastName, `%${query}%`)))
                    .limit(10);
                res.json(results);
            }
            catch (error) {
                console.error('Search players error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getRoster(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Get all players with their teams
                const allPlayers = yield db_1.db.select({
                    id: schema_1.players.id,
                    name: schema_1.players.name,
                    firstName: schema_1.players.firstName,
                    lastName: schema_1.players.lastName,
                    number: schema_1.players.number,
                    status: schema_1.players.status,
                    avatarUrl: schema_1.players.avatarUrl,
                    medicalCheckExpiry: schema_1.players.medicalCheckExpiry,
                    birthYear: schema_1.players.birthYear,
                    email: schema_1.players.email,
                }).from(schema_1.players);
                const rosterWithData = yield Promise.all(allPlayers.map((player) => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b;
                    // Ensure firstName and lastName are not null for the UI
                    const firstName = player.firstName || ((_a = player.name) === null || _a === void 0 ? void 0 : _a.split(' ')[0]) || 'Unknown';
                    const lastName = player.lastName || ((_b = player.name) === null || _b === void 0 ? void 0 : _b.split(' ').slice(1).join(' ')) || 'Player';
                    // Get teams for this player to find the "highest" category
                    const playerTeams = yield db_1.db.select({
                        name: schema_1.teams.name,
                        leagueName: schema_1.teams.leagueName
                    })
                        .from(schema_1.playersToTeams)
                        .innerJoin(schema_1.teams, (0, drizzle_orm_1.eq)(schema_1.playersToTeams.teamId, schema_1.teams.id))
                        .where((0, drizzle_orm_1.eq)(schema_1.playersToTeams.playerId, player.id));
                    // Find highest category
                    const category = playerTeams.length > 0
                        ? playerTeams.sort((a, b) => b.name.localeCompare(a.name))[0].name
                        : 'N/A';
                    // Get attendance stats
                    const playerAttendance = yield db_1.db.select()
                        .from(schema_1.attendance)
                        .where((0, drizzle_orm_1.eq)(schema_1.attendance.playerId, player.id));
                    const attended = playerAttendance.filter(a => a.status === 'present').length;
                    const total = playerAttendance.length;
                    const attendanceRate = total > 0 ? Math.round((attended / total) * 100) : 100;
                    // Get latest payment status
                    const latestPayment = yield db_1.db.select()
                        .from(schema_1.playerPayments)
                        .where((0, drizzle_orm_1.eq)(schema_1.playerPayments.playerId, player.id))
                        .orderBy((0, drizzle_orm_1.desc)(schema_1.playerPayments.year), (0, drizzle_orm_1.desc)(schema_1.playerPayments.month))
                        .limit(1);
                    const paymentStatus = latestPayment.length > 0 ? latestPayment[0].status : 'Pending';
                    return Object.assign(Object.assign({}, player), { firstName,
                        lastName,
                        category,
                        attendanceRate,
                        paymentStatus });
                })));
                res.json(rosterWithData);
            }
            catch (error) {
                console.error('Get roster error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    addPlayerToTeam(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { playerId, teamId } = req.body;
                if (!playerId || !teamId) {
                    return res.status(400).json({ error: 'playerId and teamId are required' });
                }
                const result = yield db_1.db.insert(schema_1.playersToTeams).values({
                    playerId,
                    teamId
                }).returning();
                res.json(result[0]);
            }
            catch (error) {
                console.error('Add player to team error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    updatePlayer(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const updateData = Object.assign({}, req.body);
                // Parse timestamp strings to Date objects for Drizzle
                if (updateData.medicalCheckExpiry) {
                    updateData.medicalCheckExpiry = new Date(updateData.medicalCheckExpiry);
                }
                if (updateData.createdAt) {
                    updateData.createdAt = new Date(updateData.createdAt);
                }
                const result = yield db_1.db.update(schema_1.players)
                    .set(updateData)
                    .where((0, drizzle_orm_1.eq)(schema_1.players.id, parseInt(id)))
                    .returning();
                res.json(result[0]);
            }
            catch (error) {
                console.error('Update player error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    },
    getPlayerById(req, res) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const { id } = req.params;
                const result = yield db_1.db.select({
                    id: schema_1.players.id,
                    firstName: schema_1.players.firstName,
                    lastName: schema_1.players.lastName,
                    email: schema_1.players.email,
                    number: schema_1.players.number,
                    birthYear: schema_1.players.birthYear,
                    status: schema_1.players.status,
                    avatarUrl: schema_1.players.avatarUrl,
                    medicalCheckExpiry: schema_1.players.medicalCheckExpiry,
                })
                    .from(schema_1.players)
                    .where((0, drizzle_orm_1.eq)(schema_1.players.id, parseInt(id)))
                    .limit(1);
                if (result.length === 0) {
                    return res.status(404).json({ error: 'Player not found' });
                }
                res.json(result[0]);
            }
            catch (error) {
                console.error('Get player by id error:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
};

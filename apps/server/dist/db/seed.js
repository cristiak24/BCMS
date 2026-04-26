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
const serverless_1 = require("@neondatabase/serverless");
const loadEnv_1 = require("../lib/loadEnv");
(0, loadEnv_1.loadServerEnv)();
const sql = (0, serverless_1.neon)(process.env.DATABASE_URL);
function seed() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Seeding data...');
        try {
            // 1. Create Teams
            const team1 = yield sql `
            INSERT INTO "teams" (frb_team_id, name, frb_league_id, league_name, frb_season_id, season_name, invite_code)
            VALUES ('T1', 'U16 Elite', 'L1', 'Junior League', 'S1', '2024/25', 'U16ELITE')
            ON CONFLICT (invite_code) DO UPDATE SET name = EXCLUDED.name
            RETURNING id;
        `;
            const team2 = yield sql `
            INSERT INTO "teams" (frb_team_id, name, frb_league_id, league_name, frb_season_id, season_name, invite_code)
            VALUES ('T2', 'U18 Championship', 'L2', 'Senior League', 'S1', '2024/25', 'U18CHAMP')
            ON CONFLICT (invite_code) DO UPDATE SET name = EXCLUDED.name
            RETURNING id;
        `;
            const t1Id = team1[0].id;
            const t2Id = team2[0].id;
            // 2. Create Players
            const p1 = yield sql `
            INSERT INTO "players" (first_name, last_name, number, birth_year, status)
            VALUES ('Marcus', 'Thompson', 23, 2008, 'active')
            RETURNING id;
        `;
            const p2 = yield sql `
            INSERT INTO "players" (first_name, last_name, number, birth_year, status)
            VALUES ('Derrick', 'Hayes', 11, 2007, 'active')
            RETURNING id;
        `;
            const p1Id = p1[0].id;
            const p2Id = p2[0].id;
            // 3. Relationships (Marcus is in U16 and U18)
            yield sql `INSERT INTO "players_to_teams" (player_id, team_id) VALUES (${p1Id}, ${t1Id}), (${p1Id}, ${t2Id}) ON CONFLICT DO NOTHING;`;
            yield sql `INSERT INTO "players_to_teams" (player_id, team_id) VALUES (${p2Id}, ${t2Id}) ON CONFLICT DO NOTHING;`;
            // 4. Attendance
            yield sql `INSERT INTO "attendance" (player_id, team_id, status) VALUES (${p1Id}, ${t1Id}, 'present'), (${p1Id}, ${t1Id}, 'present'), (${p1Id}, ${t1Id}, 'absent');`;
            // 5. Payments
            yield sql `INSERT INTO "player_payments" (player_id, amount, month, year, status) VALUES (${p1Id}, 200, 11, 2024, 'paid'), (${p2Id}, 200, 11, 2024, 'pending');`;
            console.log('Seeding completed successfully!');
        }
        catch (error) {
            console.error('Seeding failed:', error);
        }
    });
}
seed();

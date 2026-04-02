import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
    console.log('Starting manual migration...');
    try {
        // Create tables
        await sql`
            CREATE TABLE IF NOT EXISTS "attendance" (
                "id" serial PRIMARY KEY NOT NULL,
                "player_id" integer NOT NULL,
                "team_id" integer NOT NULL,
                "event_id" integer,
                "date" timestamp DEFAULT now() NOT NULL,
                "status" varchar(50) NOT NULL
            );
        `;
        console.log('Attendance table checked/created');

        try {
            await sql`ALTER TABLE "attendance" ADD COLUMN "event_id" integer;`;
            console.log('Added event_id to attendance');
        } catch (e) { console.log('event_id already exists or error adding it'); }

        await sql`
            CREATE TABLE IF NOT EXISTS "player_payments" (
                "id" serial PRIMARY KEY NOT NULL,
                "player_id" integer NOT NULL,
                "amount" integer NOT NULL,
                "month" integer NOT NULL,
                "year" integer NOT NULL,
                "status" varchar(50) NOT NULL,
                "date" timestamp,
                "created_at" timestamp DEFAULT now() NOT NULL
            );
        `;
        console.log('Player Payments table checked/created');

        await sql`
            CREATE TABLE IF NOT EXISTS "players_to_teams" (
                "id" serial PRIMARY KEY NOT NULL,
                "player_id" integer NOT NULL,
                "team_id" integer NOT NULL
            );
        `;
        console.log('Players to Teams table checked/created');

        // Update players table
        try {
            await sql`ALTER TABLE "players" ADD COLUMN "first_name" varchar(255);`;
            console.log('Added first_name to players');
        } catch (e) { console.log('first_name already exists or error adding it'); }

        try {
            await sql`ALTER TABLE "players" ADD COLUMN "last_name" varchar(255);`;
            console.log('Added last_name to players');
        } catch (e) { console.log('last_name already exists or error adding it'); }

        try {
            await sql`ALTER TABLE "players" ADD COLUMN "number" integer;`;
            console.log('Added number to players');
        } catch (e) { console.log('number already exists or error adding it'); }

        try {
            await sql`ALTER TABLE "players" ADD COLUMN "birth_year" integer;`;
            console.log('Added birth_year to players');
        } catch (e) { console.log('birth_year already exists or error adding it'); }

        try {
            await sql`ALTER TABLE "players" ADD COLUMN "medical_check_expiry" timestamp;`;
            console.log('Added medical_check_expiry to players');
        } catch (e) { console.log('medical_check_expiry already exists or error adding it'); }

        try {
            await sql`ALTER TABLE "players" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;`;
            console.log('Added created_at to players');
        } catch (e) { console.log('created_at already exists or error adding it'); }

        try {
            await sql`ALTER TABLE "players" ADD COLUMN "email" varchar(255);`;
            console.log('Added email to players');
        } catch (e) { console.log('email already exists or error adding it'); }

        try {
            await sql`ALTER TABLE "players" ALTER COLUMN "name" DROP NOT NULL;`;
            console.log('Optional name column set to nullable');
        } catch (e) { console.log('Error altering name column'); }

        await sql`
            CREATE TABLE IF NOT EXISTS "events" (
                "id" serial PRIMARY KEY NOT NULL,
                "type" varchar(50) NOT NULL,
                "title" varchar(255) NOT NULL,
                "description" text,
                "location" varchar(255),
                "start_time" timestamp NOT NULL,
                "end_time" timestamp NOT NULL,
                "team_id" integer,
                "coach_id" integer,
                "amount" integer,
                "status" varchar(50) DEFAULT 'scheduled',
                "created_at" timestamp DEFAULT now() NOT NULL
            );
        `;
        console.log('Events table checked/created');

        // Add foreign keys (using try-catch to avoid duplicates)
        const addFK = async (table: string, constraint: string, sqlQuery: string) => {
            try {
                if (sqlQuery.includes('attendance_player_id_players_id_fk')) {
                    await sql`ALTER TABLE "attendance" ADD CONSTRAINT "attendance_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")`;
                } else if (sqlQuery.includes('attendance_team_id_teams_id_fk')) {
                    await sql`ALTER TABLE "attendance" ADD CONSTRAINT "attendance_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")`;
                } else if (sqlQuery.includes('player_payments_player_id_players_id_fk')) {
                    await sql`ALTER TABLE "player_payments" ADD CONSTRAINT "player_payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")`;
                } else if (sqlQuery.includes('players_to_teams_player_id_players_id_fk')) {
                    await sql`ALTER TABLE "players_to_teams" ADD CONSTRAINT "players_to_teams_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")`;
                } else if (sqlQuery.includes('players_to_teams_team_id_teams_id_fk')) {
                    await sql`ALTER TABLE "players_to_teams" ADD CONSTRAINT "players_to_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")`;
                } else if (sqlQuery.includes('events_team_id_teams_id_fk')) {
                    await sql`ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")`;
                } else if (sqlQuery.includes('events_coach_id_users_id_fk')) {
                    await sql`ALTER TABLE "events" ADD CONSTRAINT "events_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "users"("id")`;
                }
                console.log(`Added FK ${constraint} to ${table}`);
            } catch (e: any) {
                if (e.message?.includes('already exists')) {
                    console.log(`FK ${constraint} already exists`);
                } else {
                    console.log(`Error adding FK ${constraint}: ${e.message}`);
                }
            }
        };

        await addFK('attendance', 'attendance_player_id_players_id_fk', 'ALTER TABLE "attendance" ADD CONSTRAINT "attendance_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")');
        await addFK('attendance', 'attendance_team_id_teams_id_fk', 'ALTER TABLE "attendance" ADD CONSTRAINT "attendance_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")');
        await addFK('player_payments', 'player_payments_player_id_players_id_fk', 'ALTER TABLE "player_payments" ADD CONSTRAINT "player_payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")');
        await addFK('players_to_teams', 'players_to_teams_player_id_players_id_fk', 'ALTER TABLE "players_to_teams" ADD CONSTRAINT "players_to_teams_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")');
        await addFK('players_to_teams', 'players_to_teams_team_id_teams_id_fk', 'ALTER TABLE "players_to_teams" ADD CONSTRAINT "players_to_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")');
        await addFK('events', 'events_team_id_teams_id_fk', 'ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")');
        await addFK('events', 'events_coach_id_users_id_fk', 'ALTER TABLE "events" ADD CONSTRAINT "events_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "users"("id")');

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();

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
function migrate() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log('Starting manual migration...');
        try {
            // Create tables
            yield sql `
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
                yield sql `ALTER TABLE "attendance" ADD COLUMN "event_id" integer;`;
                console.log('Added event_id to attendance');
            }
            catch (e) {
                console.log('event_id already exists or error adding it');
            }
            yield sql `
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
            yield sql `
            CREATE TABLE IF NOT EXISTS "players_to_teams" (
                "id" serial PRIMARY KEY NOT NULL,
                "player_id" integer NOT NULL,
                "team_id" integer NOT NULL
            );
        `;
            console.log('Players to Teams table checked/created');
            // Update players table
            try {
                yield sql `ALTER TABLE "players" ADD COLUMN "first_name" varchar(255);`;
                console.log('Added first_name to players');
            }
            catch (e) {
                console.log('first_name already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "players" ADD COLUMN "last_name" varchar(255);`;
                console.log('Added last_name to players');
            }
            catch (e) {
                console.log('last_name already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "players" ADD COLUMN "number" integer;`;
                console.log('Added number to players');
            }
            catch (e) {
                console.log('number already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "players" ADD COLUMN "birth_year" integer;`;
                console.log('Added birth_year to players');
            }
            catch (e) {
                console.log('birth_year already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "players" ADD COLUMN "medical_check_expiry" timestamp;`;
                console.log('Added medical_check_expiry to players');
            }
            catch (e) {
                console.log('medical_check_expiry already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "players" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;`;
                console.log('Added created_at to players');
            }
            catch (e) {
                console.log('created_at already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "players" ADD COLUMN "email" varchar(255);`;
                console.log('Added email to players');
            }
            catch (e) {
                console.log('email already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "players" ALTER COLUMN "name" DROP NOT NULL;`;
                console.log('Optional name column set to nullable');
            }
            catch (e) {
                console.log('Error altering name column');
            }
            yield sql `
            CREATE TABLE IF NOT EXISTS "clubs" (
                "id" serial PRIMARY KEY NOT NULL,
                "name" varchar(255) NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL
            );
        `;
            console.log('Clubs table checked/created');
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "club_id" integer;`;
                console.log('Added club_id to users');
            }
            catch (e) {
                console.log('club_id already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "first_name" varchar(255);`;
                console.log('Added first_name to users');
            }
            catch (e) {
                console.log('first_name already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "last_name" varchar(255);`;
                console.log('Added last_name to users');
            }
            catch (e) {
                console.log('last_name already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "avatar_url" text;`;
                console.log('Added avatar_url to users');
            }
            catch (e) {
                console.log('avatar_url already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "phone" varchar(50);`;
                console.log('Added phone to users');
            }
            catch (e) {
                console.log('phone already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "preferred_language" varchar(32);`;
                console.log('Added preferred_language to users');
            }
            catch (e) {
                console.log('preferred_language already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "notification_preferences" jsonb;`;
                console.log('Added notification_preferences to users');
            }
            catch (e) {
                console.log('notification_preferences already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;`;
                console.log('Added created_at to users');
            }
            catch (e) {
                console.log('created_at already exists or error adding it');
            }
            try {
                yield sql `ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp;`;
                console.log('Added last_login_at to users');
            }
            catch (e) {
                console.log('last_login_at already exists or error adding it');
            }
            yield sql `
            CREATE TABLE IF NOT EXISTS "access_requests" (
                "id" serial PRIMARY KEY NOT NULL,
                "user_id" integer NOT NULL,
                "club_id" integer NOT NULL,
                "requested_role" varchar(32) NOT NULL,
                "status" varchar(32) DEFAULT 'pending' NOT NULL,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "reviewed_at" timestamp,
                "reviewed_by" integer
            );
        `;
            console.log('Access requests table checked/created');
            yield sql `
            CREATE TABLE IF NOT EXISTS "invite_links" (
                "id" serial PRIMARY KEY NOT NULL,
                "club_id" integer NOT NULL,
                "role" varchar(32) NOT NULL,
                "token" text NOT NULL UNIQUE,
                "token_hash" text NOT NULL UNIQUE,
                "expires_at" timestamp NOT NULL,
                "refresh_interval_minutes" integer NOT NULL,
                "created_by" integer,
                "created_at" timestamp DEFAULT now() NOT NULL,
                "is_active" boolean DEFAULT true NOT NULL
            );
        `;
            console.log('Invite links table checked/created');
            yield sql `
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
            const addFK = (table, constraint, sqlQuery) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                try {
                    if (sqlQuery.includes('attendance_player_id_players_id_fk')) {
                        yield sql `ALTER TABLE "attendance" ADD CONSTRAINT "attendance_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")`;
                    }
                    else if (sqlQuery.includes('attendance_team_id_teams_id_fk')) {
                        yield sql `ALTER TABLE "attendance" ADD CONSTRAINT "attendance_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")`;
                    }
                    else if (sqlQuery.includes('player_payments_player_id_players_id_fk')) {
                        yield sql `ALTER TABLE "player_payments" ADD CONSTRAINT "player_payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")`;
                    }
                    else if (sqlQuery.includes('players_to_teams_player_id_players_id_fk')) {
                        yield sql `ALTER TABLE "players_to_teams" ADD CONSTRAINT "players_to_teams_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")`;
                    }
                    else if (sqlQuery.includes('players_to_teams_team_id_teams_id_fk')) {
                        yield sql `ALTER TABLE "players_to_teams" ADD CONSTRAINT "players_to_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")`;
                    }
                    else if (sqlQuery.includes('events_team_id_teams_id_fk')) {
                        yield sql `ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")`;
                    }
                    else if (sqlQuery.includes('events_coach_id_users_id_fk')) {
                        yield sql `ALTER TABLE "events" ADD CONSTRAINT "events_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "users"("id")`;
                    }
                    else if (sqlQuery.includes('users_club_id_clubs_id_fk')) {
                        yield sql `ALTER TABLE "users" ADD CONSTRAINT "users_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id")`;
                    }
                    else if (sqlQuery.includes('access_requests_user_id_users_id_fk')) {
                        yield sql `ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id")`;
                    }
                    else if (sqlQuery.includes('access_requests_club_id_clubs_id_fk')) {
                        yield sql `ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id")`;
                    }
                    else if (sqlQuery.includes('access_requests_reviewed_by_users_id_fk')) {
                        yield sql `ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id")`;
                    }
                    else if (sqlQuery.includes('invite_links_club_id_clubs_id_fk')) {
                        yield sql `ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id")`;
                    }
                    else if (sqlQuery.includes('invite_links_created_by_users_id_fk')) {
                        yield sql `ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id")`;
                    }
                    console.log(`Added FK ${constraint} to ${table}`);
                }
                catch (e) {
                    if ((_a = e.message) === null || _a === void 0 ? void 0 : _a.includes('already exists')) {
                        console.log(`FK ${constraint} already exists`);
                    }
                    else {
                        console.log(`Error adding FK ${constraint}: ${e.message}`);
                    }
                }
            });
            yield addFK('attendance', 'attendance_player_id_players_id_fk', 'ALTER TABLE "attendance" ADD CONSTRAINT "attendance_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")');
            yield addFK('attendance', 'attendance_team_id_teams_id_fk', 'ALTER TABLE "attendance" ADD CONSTRAINT "attendance_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")');
            yield addFK('player_payments', 'player_payments_player_id_players_id_fk', 'ALTER TABLE "player_payments" ADD CONSTRAINT "player_payments_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")');
            yield addFK('players_to_teams', 'players_to_teams_player_id_players_id_fk', 'ALTER TABLE "players_to_teams" ADD CONSTRAINT "players_to_teams_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id")');
            yield addFK('players_to_teams', 'players_to_teams_team_id_teams_id_fk', 'ALTER TABLE "players_to_teams" ADD CONSTRAINT "players_to_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")');
            yield addFK('events', 'events_team_id_teams_id_fk', 'ALTER TABLE "events" ADD CONSTRAINT "events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id")');
            yield addFK('events', 'events_coach_id_users_id_fk', 'ALTER TABLE "events" ADD CONSTRAINT "events_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "users"("id")');
            yield addFK('users', 'users_club_id_clubs_id_fk', 'ALTER TABLE "users" ADD CONSTRAINT "users_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id")');
            yield addFK('access_requests', 'access_requests_user_id_users_id_fk', 'ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id")');
            yield addFK('access_requests', 'access_requests_club_id_clubs_id_fk', 'ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id")');
            yield addFK('access_requests', 'access_requests_reviewed_by_users_id_fk', 'ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id")');
            yield addFK('invite_links', 'invite_links_club_id_clubs_id_fk', 'ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id")');
            yield addFK('invite_links', 'invite_links_created_by_users_id_fk', 'ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id")');
            console.log('Migration completed successfully!');
        }
        catch (error) {
            console.error('Migration failed:', error);
        }
    });
}
migrate();

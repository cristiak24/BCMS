-- Attendance confirmation (Val 3): a player's or parent's "Vin / Nu vin / Poate"
-- for one training, match or camp, given before the event starts. One row per
-- player per event. A hint for the coach only; attendance is untouched.
-- New table only: no change to existing data, safe to re-run.
CREATE TABLE IF NOT EXISTS "event_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"status" varchar(12) NOT NULL,
	"reason" varchar(200),
	"responded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_responses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE cascade,
	CONSTRAINT "event_responses_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE cascade,
	CONSTRAINT "event_responses_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "users"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "event_responses_event_player_unique" ON "event_responses" ("event_id","player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_responses_player_idx" ON "event_responses" ("player_id");

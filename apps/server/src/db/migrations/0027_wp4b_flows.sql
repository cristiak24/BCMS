-- Missing flows from the 2026-10-15 audit (WP4B).
--
-- events.opponent: the other side of a match, typed once on the event and
-- used by the L12 sheet ("Jocul: … vs. …", which printed the event title in
-- its place) and as the scorer's default opponent.
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "opponent" varchar(160);
--> statement-breakpoint
-- players.birth_date: the full date of birth from a parent's join request.
-- Only the year (birth_year) used to be kept. Staff-only data, like the rest
-- of a player's personal fields.
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "birth_date" date;
--> statement-breakpoint
-- GDPR erasure requests can now be closed: who closed them and what was done.
ALTER TABLE "privacy_requests" ADD COLUMN IF NOT EXISTS "closed_by" integer;
--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD COLUMN IF NOT EXISTS "resolution_note" text;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_closed_by_users_id_fk"
		FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

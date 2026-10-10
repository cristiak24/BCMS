-- Invite codes and links can pre-select a team: parents who sign up with one
-- get their children placed in that team directly. Additive and nullable.
ALTER TABLE "club_invite_codes" ADD COLUMN IF NOT EXISTS "team_id" integer;
--> statement-breakpoint
ALTER TABLE "invite_links" ADD COLUMN IF NOT EXISTS "team_id" integer;

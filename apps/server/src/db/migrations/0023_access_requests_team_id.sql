-- A player-role access-link request can now carry a team, same as a
-- parent's does: approval creates the players row on that team directly
-- instead of leaving a player-role account with no roster row at all.
ALTER TABLE "access_requests" ADD COLUMN IF NOT EXISTS "team_id" integer;

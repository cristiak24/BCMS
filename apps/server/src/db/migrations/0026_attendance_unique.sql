-- One attendance row per player per session. The save read "is there a row?"
-- outside its transaction, so two saves at once (coach and admin, a double
-- tap) could insert the same player twice on a pooled Postgres. Existing
-- duplicates are folded into the newest row (the last save wins), keeping a
-- note from an older copy when the newest has none. Rows without an event
-- (legacy, event_id NULL) are not touched: NULLs never collide in the index.
UPDATE "attendance" AS keep
SET "note" = older."note"
FROM (
  SELECT DISTINCT ON ("event_id", "player_id") "event_id", "player_id", "note"
  FROM "attendance"
  WHERE "event_id" IS NOT NULL AND "note" IS NOT NULL
  ORDER BY "event_id", "player_id", "id" DESC
) AS older
WHERE keep."note" IS NULL
  AND keep."event_id" = older."event_id" AND keep."player_id" = older."player_id"
  AND keep."id" = (
    SELECT max(a."id") FROM "attendance" a
    WHERE a."event_id" = keep."event_id" AND a."player_id" = keep."player_id"
  );
--> statement-breakpoint
DELETE FROM "attendance" a
USING "attendance" b
WHERE a."event_id" = b."event_id" AND a."player_id" = b."player_id"
  AND a."id" < b."id";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_event_player_unique" ON "attendance" ("event_id","player_id");

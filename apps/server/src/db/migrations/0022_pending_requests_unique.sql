-- One waiting request per person: reopening an access link or retrying a
-- signup must not stack a second pending row for the admin. Partial unique
-- indexes only cover status = 'pending', so a new request is still allowed
-- after a denial. Duplicates already waiting are folded into the oldest row.
DELETE FROM "access_requests" a
USING "access_requests" b
WHERE a."status" = 'pending' AND b."status" = 'pending'
  AND a."user_id" = b."user_id" AND a."club_id" = b."club_id" AND a."requested_role" = b."requested_role"
  AND a."id" > b."id";
--> statement-breakpoint
DELETE FROM "family_join_requests" a
USING "family_join_requests" b
WHERE a."status" = 'pending' AND b."status" = 'pending'
  AND a."user_id" = b."user_id" AND a."team_id" = b."team_id" AND a."kind" = b."kind"
  AND lower(a."child_first_name") = lower(b."child_first_name")
  AND lower(a."child_last_name") = lower(b."child_last_name")
  AND a."id" > b."id";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "access_requests_pending_unique" ON "access_requests" ("user_id","club_id","requested_role") WHERE "status" = 'pending';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "family_join_requests_pending_unique" ON "family_join_requests" ("user_id","team_id","kind",lower("child_first_name"),lower("child_last_name")) WHERE "status" = 'pending';

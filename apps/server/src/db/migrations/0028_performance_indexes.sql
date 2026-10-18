-- Indexes on the foreign keys and filter columns every club screen reads by
-- (audit P1-13). Until now only a handful existed, so Lot, Finanțe, Program
-- and the dashboard scanned whole tables, and got slower with every season.
-- Only CREATE INDEX IF NOT EXISTS: no data changes, safe to re-run.
-- (The unique attendance(event_id, player_id) index is migration 0026.)
CREATE INDEX IF NOT EXISTS "events_team_start_idx" ON "events" ("team_id","start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_player_date_idx" ON "attendance" ("player_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_team_date_idx" ON "attendance" ("team_id","date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_team_id_idx" ON "players" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_to_teams_team_id_idx" ON "players_to_teams" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_to_teams_player_id_idx" ON "players_to_teams" ("player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_payments_player_id_idx" ON "player_payments" ("player_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications" ("user_id","is_read");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_club_id_idx" ON "users" ("club_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teams_club_id_idx" ON "teams" ("club_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_club_created_idx" ON "audit_logs" ("club_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "financial_documents_club_id_idx" ON "financial_documents" ("club_id");

-- Fee settings get a real club key and a billing start month (audit BUG-004/032).
-- Additive: old code keeps reading rows by id, which the backfill preserves.
ALTER TABLE "financial_settings" ADD COLUMN IF NOT EXISTS "club_id" integer;
--> statement-breakpoint
ALTER TABLE "financial_settings" ADD COLUMN IF NOT EXISTS "billing_start_month" varchar(7);
--> statement-breakpoint
-- Until now a club's row was the one whose id equals the club id.
UPDATE "financial_settings" fs SET "club_id" = fs."id"
WHERE fs."club_id" IS NULL AND EXISTS (SELECT 1 FROM "clubs" c WHERE c."id" = fs."id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "financial_settings" ADD CONSTRAINT "financial_settings_club_id_unique" UNIQUE ("club_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
-- Inserts used to pin the id, so the sequence never moved; new rows now take
-- the serial default and must not collide with an existing id.
SELECT setval(pg_get_serial_sequence('financial_settings', 'id'), GREATEST((SELECT COALESCE(MAX("id"), 0) FROM "financial_settings"), 1), true);

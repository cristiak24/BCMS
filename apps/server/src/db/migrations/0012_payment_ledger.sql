-- Payment idempotency and fee allocation (audit BUG-001/002/005/006/007).
-- Additive only: code that predates these columns keeps working.
ALTER TABLE "player_payments" ADD COLUMN IF NOT EXISTS "stripe_session_id" varchar(255);
--> statement-breakpoint
ALTER TABLE "player_payments" ADD COLUMN IF NOT EXISTS "fee_ids" text;
--> statement-breakpoint
ALTER TABLE "player_payments" ADD COLUMN IF NOT EXISTS "method" varchar(20);
--> statement-breakpoint
ALTER TABLE "player_payments" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "player_payments" ADD CONSTRAINT "player_payments_stripe_session_id_unique" UNIQUE ("stripe_session_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;

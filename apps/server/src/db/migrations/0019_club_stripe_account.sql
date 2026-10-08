-- Stripe Connect per club (audit BUG-014). Additive; nothing changes until a
-- club admin connects an account.
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "stripe_account_id" varchar(64);
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "stripe_charges_enabled" boolean DEFAULT false NOT NULL;

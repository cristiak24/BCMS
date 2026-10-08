-- Explicit account → roster record link (audit BUG-013). Additive; records are
-- claimed on the account's next sign-in (lib/selfPlayer.ts), no backfill.
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "players" ADD CONSTRAINT "players_user_id_unique" UNIQUE ("user_id");
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "players" ADD CONSTRAINT "players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

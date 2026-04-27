ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "token" varchar(255);--> statement-breakpoint
UPDATE "invites" SET "token" = COALESCE("token", "token_hash");--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_token_unique" UNIQUE ("token");--> statement-breakpoint

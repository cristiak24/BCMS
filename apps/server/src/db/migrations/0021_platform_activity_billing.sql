-- Super admin: monthly activity per account (what platform billing counts),
-- plus per-club billing price and internal notes. Additive only.
CREATE TABLE IF NOT EXISTS "user_activity_months" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"club_id" integer,
	"role" "role",
	"month" varchar(7) NOT NULL,
	"active_days" integer DEFAULT 1 NOT NULL,
	"last_seen_day" varchar(10) NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_activity_months_user_month_unique" UNIQUE("user_id","month"),
	CONSTRAINT "user_activity_months_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_activity_months_month_idx" ON "user_activity_months" ("month");
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "billing_price_per_user" numeric(12, 2);
--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN IF NOT EXISTS "internal_notes" text;

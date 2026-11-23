-- Web push (Val 3B): devices subscribed to push notifications and each
-- account's per-type choices. New tables only: no change to existing data,
-- safe to re-run.
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" varchar(255) NOT NULL,
	"auth" varchar(255) NOT NULL,
	"device_label" varchar(60),
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_unique" ON "push_subscriptions" ("endpoint");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_preferences" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"event_new" boolean DEFAULT true NOT NULL,
	"event_changed" boolean DEFAULT true NOT NULL,
	"rsvp_reminder" boolean DEFAULT true NOT NULL,
	"rsvp_declined" boolean DEFAULT true NOT NULL,
	"payment_overdue" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "push_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
);

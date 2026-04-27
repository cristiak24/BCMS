CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "action" varchar(120) NOT NULL,
  "entity_type" varchar(80) NOT NULL,
  "entity_id" varchar(120),
  "actor_user_id" integer,
  "actor_uid" varchar(255),
  "actor_role" "role",
  "club_id" integer,
  "metadata" text,
  "ip_address" varchar(120),
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id"),
  CONSTRAINT "audit_logs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "clubs"("id")
);--> statement-breakpoint

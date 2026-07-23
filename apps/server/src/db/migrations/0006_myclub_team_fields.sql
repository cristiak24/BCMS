CREATE TYPE "public"."team_gender" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TYPE "public"."team_level" AS ENUM('national', 'municipal', 'initiere');--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "gender" "team_gender";--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "level" "team_level";--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "coach_id" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;

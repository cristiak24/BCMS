CREATE TYPE "public"."role" AS ENUM('admin', 'coach', 'accountant');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('pending', 'processed', 'rejected');--> statement-breakpoint
CREATE TABLE "financial_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"amount" integer NOT NULL,
	"description" text,
	"date" timestamp DEFAULT now() NOT NULL,
	"document_url" text,
	"status" "status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"position" varchar(50),
	"status" varchar(50),
	"avatar_url" text,
	"team_id" integer
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"frb_team_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"frb_league_id" varchar(50) NOT NULL,
	"league_name" varchar(255) NOT NULL,
	"frb_season_id" varchar(50) NOT NULL,
	"season_name" varchar(255) NOT NULL,
	"invite_code" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "teams_invite_code_unique" UNIQUE("invite_code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"role" "role" DEFAULT 'coach' NOT NULL,
	"status" "status" DEFAULT 'pending' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;
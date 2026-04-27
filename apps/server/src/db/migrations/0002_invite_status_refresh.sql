ALTER TYPE "public"."invite_status" RENAME TO "invite_status_old";--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "status" TYPE "public"."invite_status" USING CASE
  WHEN "status"::text = 'active' THEN 'pending'
  WHEN "status"::text = 'used' THEN 'accepted'
  ELSE "status"::text
END::"public"."invite_status";--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
DROP TYPE "public"."invite_status_old";--> statement-breakpoint

-- Email invitations kept the raw token next to its hash (audit, security
-- section). Validation only ever uses token_hash; replace the raw value so a
-- database leak no longer yields working invitation links.
UPDATE "invites" SET "token" = "token_hash" WHERE "token" IS DISTINCT FROM "token_hash";

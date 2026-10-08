-- Email notification opt-out per account (Profil → Notificări → Email).
-- Additive; defaults to on, matching what the profile screen showed.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_notifications" boolean DEFAULT true NOT NULL;

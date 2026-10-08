-- Amounts with bani (audit BUG-019): integer → numeric(12,2). Existing values
-- are whole lei and convert exactly. The pg driver returns numeric as a
-- string; the schema maps it back to a number (mode: 'number').
ALTER TABLE "player_payments" ALTER COLUMN "amount" TYPE numeric(12,2) USING "amount"::numeric(12,2);
--> statement-breakpoint
ALTER TABLE "financial_documents" ALTER COLUMN "amount" TYPE numeric(12,2) USING "amount"::numeric(12,2);
--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "amount" TYPE numeric(12,2) USING "amount"::numeric(12,2);
--> statement-breakpoint
ALTER TABLE "financial_settings" ALTER COLUMN "monthly_player_fee" TYPE numeric(12,2) USING "monthly_player_fee"::numeric(12,2);
--> statement-breakpoint
ALTER TABLE "financial_settings" ALTER COLUMN "training_levy" TYPE numeric(12,2) USING "training_levy"::numeric(12,2);
--> statement-breakpoint
ALTER TABLE "financial_settings" ALTER COLUMN "facility_fee" TYPE numeric(12,2) USING "facility_fee"::numeric(12,2);

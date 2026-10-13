-- A team's join code can be switched off without rotating it (enrolment season
-- is over, the printed code stays valid for when it reopens). Additive; every
-- existing team stays open. Apply BEFORE deploying the code that reads it:
-- every team query selects this column.
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "join_code_enabled" boolean DEFAULT true NOT NULL;

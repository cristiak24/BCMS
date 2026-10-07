-- Attendance rows were dated by when they were last saved (audit BUG-020).
-- Date every row linked to an event by that event's start, so monthly stats
-- count each session in the month it happened. Rows without an event keep
-- their date.
UPDATE "attendance" a
SET "date" = e."start_time"
FROM "events" e
WHERE a."event_id" = e."id" AND a."date" IS DISTINCT FROM e."start_time";

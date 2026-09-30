-- The rating is now the running total of points (hundredths, never below 0),
-- and the total at the start of the week to measure the week against
-- (2026-09-30). A new database gets these columns from schema.sql and skips
-- this. Applied once with:
--   npx wrangler d1 execute usmleengo-rating --remote --file=points.sql
--
-- The columns are added, not renamed, so the server already running keeps
-- working until the new one is deployed. Nobody's points are guessed here: each
-- player's own app works them out from its saved answers the first time it is
-- opened and sends them, and until then a row stays at 0.
--
-- xp, credit, fluent, base_xp, base_credit and base_fluent are no longer used
-- and stay, because a column cannot always be dropped.
ALTER TABLE players ADD COLUMN points      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN base_points INTEGER NOT NULL DEFAULT 0;

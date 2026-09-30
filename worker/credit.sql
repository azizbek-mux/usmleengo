-- The rating's two running totals - net knowledge credit and the time credits
-- of right answers, in hundredths - and this week's base for each, added to a
-- players table made before the rating measured them (2026-09-30). A new
-- database gets these columns from schema.sql and skips this. Applied once with:
--   npx wrangler d1 execute usmleengo-rating --remote --file=credit.sql
--
-- Nobody's credit is guessed here. Each player's own app works it out from
-- the answers it has kept, the first time it is opened, and sends it; until
-- then a row stays at 0. That is more accurate than anything the server could
-- estimate from XP, and the streak - the biggest part of the points - is
-- untouched.
ALTER TABLE players ADD COLUMN credit      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN fluent      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN base_credit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN base_fluent INTEGER NOT NULL DEFAULT 0;

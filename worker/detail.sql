-- What a student in a class shares beyond the rating — right answers and
-- right/wrong per category — added to a players table made before
-- classrooms existed (2026-09-28). A new database gets these columns from
-- schema.sql and skips this. Applied once with:
--   npx wrangler d1 execute usmleengo-rating --remote --file=detail.sql
ALTER TABLE players ADD COLUMN correct INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN topics  TEXT    NOT NULL DEFAULT '';

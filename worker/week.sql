-- The weekly board's columns, added to a database created before it existed
-- (2026-09-28). A new database gets them from schema.sql and skips this.
-- Applied once with:
--   npx wrangler d1 execute usmleengo-rating --remote --file=week.sql
ALTER TABLE players ADD COLUMN week      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN week_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN base_xp   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN base_bms  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN base_bn   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN base_gms  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN base_gn   INTEGER NOT NULL DEFAULT 0;

-- The rating database: one row per player, keyed by a hash of their Telegram
-- id (see src/lib/scorecard.js playerKey) — raw ids are never stored.
-- Applied with: npx wrangler d1 execute usmleengo-rating --remote --file=schema.sql
-- Kept in step with SCHEMA in src/board.js; the tests check they match.

CREATE TABLE IF NOT EXISTS players (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  username   TEXT,
  streak     INTEGER NOT NULL,
  last_day   INTEGER NOT NULL,
  xp         INTEGER NOT NULL DEFAULT 0,
  answered   INTEGER NOT NULL,
  binary_ms  INTEGER NOT NULL,
  binary_n   INTEGER NOT NULL,
  gap_ms     INTEGER NOT NULL,
  gap_n      INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  week       INTEGER NOT NULL DEFAULT 0,
  week_days  INTEGER NOT NULL DEFAULT 0,
  correct    INTEGER NOT NULL DEFAULT 0,
  topics     TEXT    NOT NULL DEFAULT '',
  points     INTEGER NOT NULL DEFAULT 0,
  base_points INTEGER NOT NULL DEFAULT 0
);

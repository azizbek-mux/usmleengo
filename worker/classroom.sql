-- The classrooms' tables (2026-09-28). Kept in step with CLASS_SCHEMA in
-- src/classroom.js; the tests check they match. Safe to run on any database:
--   npx wrangler d1 execute usmleengo-rating --remote --file=classroom.sql

CREATE TABLE IF NOT EXISTS classes (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  teacher          TEXT NOT NULL,
  teacher_name     TEXT NOT NULL,
  teacher_username TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS classes_teacher ON classes (teacher);
CREATE TABLE IF NOT EXISTS members (
  class_id     TEXT NOT NULL,
  player       TEXT NOT NULL,
  status       TEXT NOT NULL,
  name         TEXT NOT NULL,
  username     TEXT,
  requested_at INTEGER NOT NULL,
  joined_at    INTEGER,
  base         TEXT,
  PRIMARY KEY (class_id, player)
);
CREATE INDEX IF NOT EXISTS members_player ON members (player);

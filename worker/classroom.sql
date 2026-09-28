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
CREATE TABLE IF NOT EXISTS packages (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  questions  TEXT NOT NULL,
  count      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS packages_class ON packages (class_id);
CREATE TABLE IF NOT EXISTS assignments (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL,
  package_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  due_at     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assignments_class ON assignments (class_id);
CREATE TABLE IF NOT EXISTS attempts (
  assignment_id TEXT NOT NULL,
  player        TEXT NOT NULL,
  score         INTEGER NOT NULL,
  total         INTEGER NOT NULL,
  answers       TEXT NOT NULL,
  finished_at   INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, player)
);
CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS images_class ON images (class_id);
CREATE TABLE IF NOT EXISTS uploads (
  token      TEXT PRIMARY KEY,
  owner      TEXT NOT NULL,
  file_id    TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  text       TEXT,
  opened     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS uploads_owner ON uploads (owner);

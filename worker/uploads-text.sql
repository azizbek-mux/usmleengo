-- Questions written straight into the bot's chat: the text itself, and
-- whether the teacher has opened the list in the app yet — added to an
-- uploads table made before messages were read (2026-09-28). A new database
-- gets these from classroom.sql and skips this. Applied once with:
--   npx wrangler d1 execute usmleengo-rating --remote --file=uploads-text.sql
ALTER TABLE uploads ADD COLUMN text   TEXT;
ALTER TABLE uploads ADD COLUMN opened INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS uploads_owner ON uploads (owner);

// Storing players and ranking them.
//
// One row per player. The ranking itself is computed here with the very same
// rating.js the app uses, so the points a player sees for themselves are the
// points the board ranks them on.
//
// Reading every player for every request would not last: D1's free plan
// allows 5 million rows read a day. So the whole field is read at most once a
// minute into a snapshot, and each request ranks against that. At 2,000
// players that is under 3 million rows a day even if someone is looking
// every minute of it.

import { BOARDS, dayIndex, points, rate, standings } from "../../src/lib/rating.js";

export const SNAPSHOT_MS = 60000;
export const TOP = 10;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  username   TEXT,
  streak     INTEGER NOT NULL,
  last_day   INTEGER NOT NULL,
  xp         INTEGER NOT NULL,
  answered   INTEGER NOT NULL,
  binary_ms  INTEGER NOT NULL,
  binary_n   INTEGER NOT NULL,
  gap_ms     INTEGER NOT NULL,
  gap_n      INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

/** Today's day index on the server — the only clock the ranking trusts. */
export const serverToday = (now = Date.now()) => dayIndex(new Date(now).toISOString().slice(0, 10));

/**
 * Save a player's score, and their current name. The write is skipped by the
 * database itself when nothing has changed, so an app that syncs the same
 * numbers again costs a read and no write.
 */
export async function savePlayer(db, who, score, now = Date.now()) {
  const t = score.timing;
  const result = await db.prepare(`
    INSERT INTO players (key, name, username, streak, last_day, xp, answered,
                         binary_ms, binary_n, gap_ms, gap_n, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT(key) DO UPDATE SET
      name = excluded.name, username = excluded.username,
      streak = excluded.streak, last_day = excluded.last_day,
      xp = excluded.xp, answered = excluded.answered,
      binary_ms = excluded.binary_ms, binary_n = excluded.binary_n,
      gap_ms = excluded.gap_ms, gap_n = excluded.gap_n,
      updated_at = excluded.updated_at
    WHERE players.name IS NOT excluded.name OR players.username IS NOT excluded.username
       OR players.streak != excluded.streak OR players.last_day != excluded.last_day
       OR players.xp != excluded.xp OR players.answered != excluded.answered
       OR players.binary_ms != excluded.binary_ms OR players.binary_n != excluded.binary_n
       OR players.gap_ms != excluded.gap_ms OR players.gap_n != excluded.gap_n
  `).bind(who.key, who.name, who.username, score.streak, score.lastDay, score.xp, score.answered,
    t.binaryMs, t.binaryN, t.gapMs, t.gapN, Math.floor(now / 1000)).run();
  return (result?.meta?.changes ?? 0) > 0;
}

const fromRow = (r) => ({
  key: r.key,
  name: r.name,
  username: r.username || null,
  score: {
    streak: r.streak, lastDay: r.last_day, xp: r.xp, answered: r.answered,
    timing: { binaryMs: r.binary_ms, binaryN: r.binary_n, gapMs: r.gap_ms, gapN: r.gap_n },
  },
});

/**
 * Everyone, at most a minute old. Kept in the Worker's memory between
 * requests; a new Worker instance simply reads it afresh.
 */
export function snapshotCache() {
  let held = null;
  return {
    async get(db, now = Date.now()) {
      if (held && now - held.at < SNAPSHOT_MS) return held.players;
      const { results } = await db.prepare(`
        SELECT key, name, username, streak, last_day, xp, answered,
               binary_ms, binary_n, gap_ms, gap_n FROM players
      `).all();
      held = { at: now, players: new Map(results.map((r) => [r.key, fromRow(r)])) };
      return held.players;
    },
    /** Put a just-saved score into the snapshot, so its sender sees it at once. */
    patch(who, score) {
      if (held) held.players.set(who.key, { key: who.key, name: who.name, username: who.username, score });
    },
    clear() { held = null; },
  };
}

/** What one row of the board carries to the app. */
function shown(row) {
  return {
    place: row.place,
    name: row.isMe ? null : row.name,
    username: row.isMe ? null : row.username,
    isMe: Boolean(row.isMe),
    points: points(row.rating.overall),
    raw: row.rating.raw,
  };
}

/**
 * The board as one player sees it: the top ten on each of the four boards,
 * and their own place on each out of everyone.
 *
 *   players — the snapshot
 *   me      — { key } for a verified player, or null for someone outside
 *             Telegram, who is placed but never stored
 *   score   — the score to place `me` on: their live one, so their own place
 *             never lags behind what they have just done
 *
 * Names leave the server only for the top ten. Everyone else is counted, and
 * that is all.
 */
export function standingsFor(players, me, score, today) {
  const field = [];
  for (const p of players.values()) {
    if (me && p.key === me.key) continue;
    field.push({ key: p.key, name: p.name, username: p.username, rating: rate(p.score, today) });
  }
  const viewer = score ? { key: me?.key || "__visitor", name: null, rating: rate(score, today) } : null;

  const top = {};
  const mine = {};
  for (const board of BOARDS) {
    const s = standings(board.id, field, viewer);
    top[board.id] = s.rows.slice(0, TOP).map(shown);
    mine[board.id] = { place: s.me?.place ?? null, total: s.total };
  }
  return { top, me: mine, ranked: Boolean(me) };
}

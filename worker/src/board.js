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
//
// Two boards come out of it:
//
//   - the rating, all time: points from each player's whole record;
//   - this week: points from this week alone, Monday to Sunday — the same
//     formula, fed with the days studied, the credit earned and the time taken
//     since Monday, so everyone starts the week level.
//
// A week is measured against where the player stood when it began: the
// first save of a new week moves their numbers so far into base_* columns,
// and the week is the difference. The days studied are a bitmask, one bit
// per weekday, set from the lastDay each save carries.

import {
  BOARDS, dayIndex, daysIn, points, rate, standings, weekOf, weekStart, weekdayOf,
} from "../../src/lib/rating.js";

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
  updated_at INTEGER NOT NULL,
  week       INTEGER NOT NULL DEFAULT 0,
  week_days  INTEGER NOT NULL DEFAULT 0,
  base_xp    INTEGER NOT NULL DEFAULT 0,
  base_bms   INTEGER NOT NULL DEFAULT 0,
  base_bn    INTEGER NOT NULL DEFAULT 0,
  base_gms   INTEGER NOT NULL DEFAULT 0,
  base_gn    INTEGER NOT NULL DEFAULT 0,
  correct    INTEGER NOT NULL DEFAULT 0,
  topics     TEXT    NOT NULL DEFAULT '',
  credit     INTEGER NOT NULL DEFAULT 0,
  fluent     INTEGER NOT NULL DEFAULT 0,
  base_credit INTEGER NOT NULL DEFAULT 0,
  base_fluent INTEGER NOT NULL DEFAULT 0
)`;

/** Today's day index on the server — the only clock the ranking trusts. */
export const serverToday = (now = Date.now()) => dayIndex(new Date(now).toISOString().slice(0, 10));

/**
 * Save a player's score, and their current name. The write is skipped by the
 * database itself when nothing has changed, so an app that syncs the same
 * numbers again costs a read and no write. Returns the stored row when it
 * was written, or null when nothing changed.
 *
 * Every SET below reads the row as it was before this save, which is what
 * lets a new week's base be the old week's final numbers.
 *
 * `detail` — { correct, topics } from checkDetail — comes only from players
 * in a classroom. Without it the stored values are left as they were.
 *
 * `score.credit` and `score.fluent` (see rating.js) are null from an app that
 * predates them, and the stored totals are then left alone. The first time
 * they arrive for a player who had none, this week's base is set to them, so
 * a whole history of credit is not counted as one week's work.
 */
export async function savePlayer(db, who, score, now = Date.now(), detail = null) {
  const t = score.timing;
  const today = serverToday(now);
  const week = weekOf(today);
  // The day studied counts for this week only if it falls in it.
  const dayBit = Number.isInteger(score.lastDay) && weekOf(score.lastDay) === week
    ? 1 << weekdayOf(score.lastDay) : 0;
  const { results } = await db.prepare(`
    INSERT INTO players (key, name, username, streak, last_day, xp, answered,
                         binary_ms, binary_n, gap_ms, gap_n, updated_at, week, week_days,
                         correct, topics, credit, fluent)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
            COALESCE(?15, 0), COALESCE(?16, ''), COALESCE(?17, 0), COALESCE(?18, 0))
    ON CONFLICT(key) DO UPDATE SET
      name = excluded.name, username = excluded.username,
      streak = excluded.streak, last_day = excluded.last_day,
      xp = excluded.xp, answered = excluded.answered,
      binary_ms = excluded.binary_ms, binary_n = excluded.binary_n,
      gap_ms = excluded.gap_ms, gap_n = excluded.gap_n,
      updated_at = excluded.updated_at,
      base_xp  = CASE WHEN players.week = excluded.week THEN players.base_xp  ELSE players.xp END,
      base_bms = CASE WHEN players.week = excluded.week THEN players.base_bms ELSE players.binary_ms * players.binary_n END,
      base_bn  = CASE WHEN players.week = excluded.week THEN players.base_bn  ELSE players.binary_n END,
      base_gms = CASE WHEN players.week = excluded.week THEN players.base_gms ELSE players.gap_ms * players.gap_n END,
      base_gn  = CASE WHEN players.week = excluded.week THEN players.base_gn  ELSE players.gap_n END,
      week_days = CASE WHEN players.week = excluded.week
                       THEN players.week_days | excluded.week_days ELSE excluded.week_days END,
      week = excluded.week,
      base_credit = CASE
        WHEN players.week != excluded.week THEN players.credit
        WHEN players.credit = 0 AND players.fluent = 0 AND players.base_credit = 0 AND players.base_fluent = 0
             AND (COALESCE(?17, 0) != 0 OR COALESCE(?18, 0) != 0) THEN COALESCE(?17, 0)
        ELSE players.base_credit END,
      base_fluent = CASE
        WHEN players.week != excluded.week THEN players.fluent
        WHEN players.credit = 0 AND players.fluent = 0 AND players.base_credit = 0 AND players.base_fluent = 0
             AND (COALESCE(?17, 0) != 0 OR COALESCE(?18, 0) != 0) THEN COALESCE(?18, 0)
        ELSE players.base_fluent END,
      credit = COALESCE(?17, players.credit),
      fluent = COALESCE(?18, players.fluent),
      correct = COALESCE(?15, players.correct),
      topics = COALESCE(?16, players.topics)
    WHERE players.name IS NOT excluded.name OR players.username IS NOT excluded.username
       OR players.streak != excluded.streak OR players.last_day != excluded.last_day
       OR players.xp != excluded.xp OR players.answered != excluded.answered
       OR players.binary_ms != excluded.binary_ms OR players.binary_n != excluded.binary_n
       OR players.gap_ms != excluded.gap_ms OR players.gap_n != excluded.gap_n
       OR players.week != excluded.week
       OR (players.week_days | excluded.week_days) != players.week_days
       OR (?15 IS NOT NULL AND players.correct != ?15)
       OR (?16 IS NOT NULL AND players.topics != ?16)
       OR (?17 IS NOT NULL AND players.credit != ?17)
       OR (?18 IS NOT NULL AND players.fluent != ?18)
    RETURNING *
  `).bind(who.key, who.name, who.username, score.streak, score.lastDay, score.xp, score.answered,
    t.binaryMs, t.binaryN, t.gapMs, t.gapN, Math.floor(now / 1000), week, dayBit,
    detail ? detail.correct : null, detail ? detail.topics : null,
    score.credit ?? null, score.fluent ?? null).all();
  return results?.[0] || null;
}

export const fromRow = (r) => ({
  key: r.key,
  name: r.name,
  username: r.username || null,
  score: {
    streak: r.streak, lastDay: r.last_day, xp: r.xp, answered: r.answered,
    timing: { binaryMs: r.binary_ms, binaryN: r.binary_n, gapMs: r.gap_ms, gapN: r.gap_n },
    credit: r.credit ?? 0, fluent: r.fluent ?? 0,
  },
  correct: r.correct ?? 0,
  topics: r.topics || "",
  week: r.week ?? 0,
  weekDays: r.week_days ?? 0,
  base: {
    xp: r.base_xp ?? 0, bms: r.base_bms ?? 0, bn: r.base_bn ?? 0, gms: r.base_gms ?? 0, gn: r.base_gn ?? 0,
    credit: r.base_credit ?? 0, fluent: r.base_fluent ?? 0,
  },
});

/**
 * A player's week as a score rate() can take, or null if they have done
 * nothing this week. The days studied stand in for the streak — up to seven
 * — and lastDay is set to today so the streak rule, which zeroes a streak not
 * kept up to yesterday, does not apply to a week in progress.
 */
export function weekScore(p, week, today) {
  if (p.week !== week) return null;
  const days = daysIn(p.weekDays);
  const s = p.score;
  const xp = Math.max(0, s.xp - p.base.xp);
  const bn = Math.max(0, s.timing.binaryN - p.base.bn);
  const gn = Math.max(0, s.timing.gapN - p.base.gn);
  const bms = Math.max(0, s.timing.binaryMs * s.timing.binaryN - p.base.bms);
  const gms = Math.max(0, s.timing.gapMs * s.timing.gapN - p.base.gms);
  // Net credit can fall as well as rise: a week of wrong answers is a week
  // below zero, which the rating then reads as nothing.
  const credit = s.credit - p.base.credit;
  const fluent = Math.max(0, s.fluent - p.base.fluent);
  if (!days && !xp) return null;
  return {
    streak: days,
    lastDay: today,
    xp,
    credit,
    fluent,
    timing: {
      binaryMs: bn ? Math.round(bms / bn) : 0, binaryN: bn,
      gapMs: gn ? Math.round(gms / gn) : 0, gapN: gn,
    },
  };
}

/**
 * Everyone, at most a minute old. Kept in the Worker's memory between
 * requests; a new Worker instance simply reads it afresh.
 */
export function snapshotCache() {
  let held = null;
  return {
    async get(db, now = Date.now()) {
      if (held && now - held.at < SNAPSHOT_MS) return held.players;
      const { results } = await db.prepare(`SELECT * FROM players`).all();
      held = { at: now, players: new Map(results.map((r) => [r.key, fromRow(r)])) };
      return held.players;
    },
    /** Put a just-saved row into the snapshot, so its sender sees it at once. */
    patch(row) {
      if (held && row) held.players.set(row.key, fromRow(row));
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
 * their own place on each out of everyone, and this week's top ten by points
 * with their place in it.
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
  return { top, me: mine, ranked: Boolean(me), week: weekBoard(players, me, today) };
}

/** This week's top ten by points, and the viewer's place in it. */
export function weekBoard(players, me, today) {
  const week = weekOf(today);
  const field = [];
  let viewer = null;
  for (const p of players.values()) {
    const ws = weekScore(p, week, today);
    if (!ws) continue;
    const entry = { key: p.key, name: p.name, username: p.username, rating: rate(ws, today) };
    if (me && p.key === me.key) viewer = entry;
    else field.push(entry);
  }
  const s = standings("overall", field, viewer);
  return {
    top: s.rows.slice(0, TOP).map(shown),
    me: s.me
      ? { place: s.me.place, total: s.total, points: points(s.me.rating.overall), raw: s.me.rating.raw }
      : { place: null, total: s.total },
    // When this week ends: next Monday, 00:00 UTC.
    endsAt: weekStart(week + 1) * 86400000,
  };
}

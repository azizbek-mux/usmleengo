// How a user is rated.
//
// Points are what you collect by answering. Every answer adds points or takes
// some away, and the running total is the rating: the more you answer, and the
// better and quicker you answer, the more you have. Nothing else counts. The
// day streak, accuracy and the questions used are shown on the profile for
// interest and never enter the points.
//
//   A right tapped answer   5 points, plus a speed bonus of up to 15 that
//                           halves every 5 seconds: 20 if instant, 15 at 3 s,
//                           9 at 10 s, and never under 5.
//   A wrong tapped answer   -8 points.
//   A right typed answer    1.5 times a tapped one given at the same speed.
//   A wrong typed answer    nothing. A typed answer cannot be guessed, so
//                           missing one is not held against you.
//   The total               never goes below 0.
//
// Three rules keep it honest. They are the reason a rating built on volume
// cannot simply be farmed:
//
//   - A wrong tap costs more than a guess earns, so answering at random loses
//     however long it goes on: half of all guesses are right.
//   - The bonus is time, and looking an answer up takes time. A slow right
//     answer earns the plain 5, where a quick one earns up to 20. The clock
//     stops the moment you answer, so reading the explanation afterwards is
//     never counted.
//   - The second right answer to the same question is worth half of the
//     first, the third a quarter, and a tapped answer given faster than the
//     question can be read is a reflex, not an answer, and earns nothing.
//
// This file is the only place points are worked out. The app scores the local
// player and every leaderboard entry with the same functions, from raw
// numbers, so there is one algorithm and it cannot drift.

export const SCORE = {
  base: 5,
  bonus: 15,
  // Seconds for the speed bonus to halve.
  halfLife: 5,
  // A right typed answer against a tapped one at the same speed.
  typed: 1.5,
  // Taken away for a wrong tapped answer.
  wrongTap: 8,
};

/** Each earlier right answer to the same question halves what it is worth again. */
export const REPEAT = 0.5;

const stemLength = (q) => String(q?.q || "").length;

/**
 * The fastest a tapped answer can honestly be: a little over the time it
 * takes to read the stem. Faster is a reflex, not an answer.
 */
export function reflexSeconds(q) {
  return 0.7 + stemLength(q) / 60;
}

/** What a right tapped answer is worth after `seconds`, before any other rule. */
export function tappedPoints(seconds) {
  return SCORE.base + SCORE.bonus * 0.5 ** (Math.max(0, seconds) / SCORE.halfLife);
}

/**
 * What one answer adds to the total (a wrong tap takes 8 away, so this can be
 * negative). `seconds` is how long the question was up before it was
 * answered, and nothing after; when that is not known the answer counts as
 * the slowest there is. `timesRight` is how many times this question has
 * already been answered right.
 */
export function answerPoints(question, correct, seconds, timesRight = 0) {
  const typed = question?.type === "gap";
  if (!correct) return typed ? 0 : -SCORE.wrongTap;
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 60;
  if (!typed && s < reflexSeconds(question)) return 0;
  return tappedPoints(s) * (typed ? SCORE.typed : 1) * REPEAT ** Math.max(0, timesRight);
}

/* ── streak ────────────────────────────────────────────────────────────────
   Shown on the profile and on its own board. It does not touch the points. */

const DAY_MS = 86400000;

/** Whole days since 1970 for a YYYY-MM-DD date, in the date's own calendar. */
export function dayIndex(isoDate) {
  if (!isoDate) return null;
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : null;
}

/**
 * The streak that is actually still alive today.
 *
 * The stored streak is only rolled forward when someone studies, so a person
 * who stopped three weeks ago still has their old number sitting in storage.
 * Taken at face value that would keep them on the board indefinitely. A streak
 * survives if the last day studied was today or yesterday; otherwise it is 0.
 */
export function liveStreak(streak, lastDay, today) {
  const last = typeof lastDay === "number" ? lastDay : dayIndex(lastDay);
  const now = typeof today === "number" ? today : dayIndex(today);
  if (last === null || now === null) return 0;
  return now - last <= 1 ? Math.max(0, Number(streak) || 0) : 0;
}

/** The plain average time of the right answers, in ms, for display. */
export function averagePace({ binaryMs = 0, binaryN = 0, gapMs = 0, gapN = 0 } = {}) {
  const n = binaryN + gapN;
  if (!n) return null;
  return (binaryMs * binaryN + gapMs * gapN) / n;
}

/**
 * A player's rating from the raw numbers.
 *
 *   { streak, lastDay, points, timing }  →  { points, raw }
 *
 * `points` comes in as the running total in hundredths, so that answers add
 * exactly, and goes out as a whole number. `raw` holds what is shown beside
 * it: the streak, if it is still alive on `today` (a day index or
 * YYYY-MM-DD), and the average time of the right answers.
 */
export function rate({ streak = 0, lastDay = null, points = 0, timing = {} } = {}, today) {
  return {
    points: Math.max(0, Math.round((Number(points) || 0) / 100)),
    raw: { streak: liveStreak(streak, lastDay, today), pace: averagePace(timing) },
  };
}

/* ── the board ─────────────────────────────────────────────────────────── */

/**
 * The rating, and the one filter beside it. "overall" — points — is the
 * rating, and the only rank anyone holds. The streak board lists who has the
 * longest run, for interest; a place there is not a rank. `column` heads the
 * value column when that view is showing.
 */
export const BOARDS = [
  { id: "overall", name: "Points", column: "Points" },
  { id: "streak", name: "Day streak", column: "Days" },
];

/**
 * What each board is sorted by — always the number it shows, with higher
 * meaning better, so a board reads in order. Raw values make ties exact: two
 * people on 14 days share a place.
 */
export function boardValue(board, rating) {
  if (!rating) return null;
  if (board === "streak") return rating.raw?.streak ?? null;
  return Number.isFinite(rating.points) ? rating.points : null;
}

/**
 * Where one score sits in a field, counting from 1.
 *
 * Ties share a place — two people on the same score are both third, and the
 * next one down is fifth. Competition ranking, the same as any sport.
 */
export function rankOf(score, field) {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  let better = 0;
  for (const other of field) {
    if (Number.isFinite(other) && other > score + 1e-9) better++;
  }
  return better + 1;
}

/**
 * The standings for one board.
 *
 *   players — [{ key, name, rating }] everybody on the board
 *   me      — { key, rating } the person looking, or null
 *
 * The viewer is folded in whether or not they have joined, so someone who has
 * never submitted still sees where they would land, and someone who has is
 * scored on their live numbers rather than whatever they last sent.
 */
export function standings(board, players, me) {
  const scoreOf = (rating) => boardValue(board, rating);

  const others = players
    .filter((p) => !me || p.key !== me.key)
    .map((p) => ({ ...p, score: scoreOf(p.rating) }))
    .filter((p) => Number.isFinite(p.score));

  const mine = me ? scoreOf(me.rating) : null;
  const rows = Number.isFinite(mine) ? [...others, { ...me, score: mine, isMe: true }] : others;

  rows.sort((a, b) => b.score - a.score || (a.isMe ? -1 : b.isMe ? 1 : 0) ||
    String(a.name).localeCompare(String(b.name)));

  const field = rows.map((r) => r.score);
  const placed = rows.map((r) => ({ ...r, place: rankOf(r.score, field) }));

  return {
    rows: placed,
    total: placed.length,
    me: placed.find((r) => r.isMe) || null,
  };
}

/* ── weeks ─────────────────────────────────────────────────────────────────
   The weekly board runs Monday to Sunday. Day 0 (1970-01-01) was a
   Thursday, so shifting by three makes weeks start on Mondays. */

/** Which week a day index falls in. */
export const weekOf = (day) => Math.floor((day + 3) / 7);

/** 0 for Monday … 6 for Sunday. */
export const weekdayOf = (day) => (((day + 3) % 7) + 7) % 7;

/** The day index of a week's Monday. */
export const weekStart = (week) => week * 7 - 3;

/** How many days a bitmask of weekdays holds. */
export function daysIn(mask) {
  let n = 0;
  for (let m = mask >>> 0; m; m >>>= 1) n += m & 1;
  return n;
}

/** The medal for a place on the rating: gold, silver, bronze, or none. */
export function medalFor(place) {
  return { 1: "🥇", 2: "🥈", 3: "🥉" }[place] || null;
}

/** "4.8s", "12s", "1m 04s". */
export function formatPace(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(Math.round(s - m * 60)).padStart(2, "0")}s`;
}

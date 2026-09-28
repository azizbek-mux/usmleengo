// How a user is rated.
//
// Three things are measured, each scored out of 100 on its own, and then mixed
// into one overall number. They are deliberately different kinds of thing:
//
//   streak — did you turn up
//   xp     — how much have you done, weighted by how hard it was
//   speed  — how fluent are you when you do know it
//
// Every curve here saturates. A linear score would make a 300-day streak worth
// three hundred one-day streaks, which would put the board permanently out of
// reach of anyone who started this month and make it pointless to look at.
// Saturating curves keep first place winnable while still separating people
// who are close together.
//
// This file is the only place scores are computed. The app scores the local
// player and every leaderboard entry with the same functions, from raw
// numbers, so there is one algorithm and it cannot drift.

/* ── what an answer is worth ───────────────────────────────────────────────
   A gap question is harder than a two-option question in a way that is not
   arguable: multiple choice hands you the answer and asks you to recognise
   it, one of the two is right by chance alone, and the wrong option can often
   be eliminated. Typing means producing it from nothing. So it pays more.

   A wrong answer still pays, for the reason the XP sheet gives: reading why
   you were wrong is the part that works, and the app should not fine you for
   trying the harder question. */
export const XP = {
  gapCorrect: 15,
  binaryCorrect: 10,
  wrong: 2,
};

/** What one answer earns. */
export function xpFor(question, correct) {
  if (!correct) return XP.wrong;
  return question?.type === "gap" ? XP.gapCorrect : XP.binaryCorrect;
}

/* ── streak ─────────────────────────────────────────────────────────────── */

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

/** Turning up. Saturates around a month: 30 days is 63, 60 is 86, 90 is 95. */
export function streakScore(days) {
  const d = Math.max(0, Number(days) || 0);
  return 100 * (1 - Math.exp(-d / 30));
}

/* ── xp ─────────────────────────────────────────────────────────────────── */

/** Work done. Same shape, slower: 6,000 XP is 63, 18,000 is 95. */
export function xpScore(xp) {
  const x = Math.max(0, Number(xp) || 0);
  return 100 * (1 - Math.exp(-x / 6000));
}

/* ── speed ─────────────────────────────────────────────────────────────────
   Only correct answers are timed, which is the whole reason speed is safe to
   score at all: if every answer counted, the fastest route to a perfect speed
   score would be to tap at random as fast as possible.

   And each question type is judged against its own clock. Typing an answer
   takes longer than tapping one however well you know it, so one shared
   average would sink exactly the players the XP table rewards for choosing
   the harder format. Up to the free allowance scores full marks — below it the
   difference is reaction time and thumbs, not knowledge. Past it the score
   falls away gently and never reaches zero, because a slow correct answer is
   still a correct answer. */
export const FREE_SECONDS = { binary: 4, gap: 10 };
const DECAY_SECONDS = 12;

/** Score for one question type's average, or null if none was timed. */
export function paceScore(avgMs, freeSeconds) {
  const ms = Number(avgMs);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const over = Math.max(0, ms / 1000 - freeSeconds);
  return (100 * DECAY_SECONDS) / (DECAY_SECONDS + over);
}

/**
 * Speed from per-type averages, weighted by how many of each were timed.
 *
 * timing = { binaryMs, binaryN, gapMs, gapN } — averages in ms, and counts.
 * Returns null for someone with nothing timed yet.
 */
export function speedScore({ binaryMs = 0, binaryN = 0, gapMs = 0, gapN = 0 } = {}) {
  const parts = [];
  const b = binaryN > 0 ? paceScore(binaryMs, FREE_SECONDS.binary) : null;
  const g = gapN > 0 ? paceScore(gapMs, FREE_SECONDS.gap) : null;
  if (b !== null) parts.push([b, binaryN]);
  if (g !== null) parts.push([g, gapN]);
  const n = parts.reduce((s, [, c]) => s + c, 0);
  if (!n) return null;
  return parts.reduce((s, [score, c]) => s + score * c, 0) / n;
}

/** The plain average time over every timed answer, for display. */
export function averagePace({ binaryMs = 0, binaryN = 0, gapMs = 0, gapN = 0 } = {}) {
  const n = binaryN + gapN;
  if (!n) return null;
  return (binaryMs * binaryN + gapMs * gapN) / n;
}

/* ── the mix ───────────────────────────────────────────────────────────────
   Showing up beats volume beats speed, which is the order asked for and also
   the order that matches how anyone actually passes this exam. Speed is the
   tiebreaker between two people who are both here every day and both working,
   not a thing to chase on its own. */
export const WEIGHTS = { streak: 0.5, xp: 0.3, speed: 0.2 };

/**
 * One number out of 100.
 *
 * Someone who has never had a correct answer timed has no speed score. Rather
 * than score them zero for it — which would rank a new user below where they
 * belong on a thing they have not been measured on — speed is dropped and the
 * other two weights are scaled back up to fill the gap.
 */
export function overallScore({ streak, xp, speed }) {
  const parts = [
    [streak, WEIGHTS.streak],
    [xp, WEIGHTS.xp],
    [speed, WEIGHTS.speed],
  ].filter(([value]) => value !== null && value !== undefined && Number.isFinite(value));

  const weight = parts.reduce((sum, [, w]) => sum + w, 0);
  if (!weight) return 0;
  return parts.reduce((sum, [value, w]) => sum + value * w, 0) / weight;
}

/**
 * Every score for one player, from the raw numbers.
 *
 *   { streak, lastDay, xp, timing }  →  { streak, xp, speed, overall, raw }
 *
 * `today` is a day index or YYYY-MM-DD; the streak is only counted if it is
 * still alive on that day.
 */
export function rate({ streak = 0, lastDay = null, xp = 0, timing = {} } = {}, today) {
  const days = liveStreak(streak, lastDay, today);
  const parts = {
    streak: streakScore(days),
    xp: xpScore(xp),
    speed: speedScore(timing),
  };
  return {
    ...parts,
    overall: overallScore(parts),
    raw: { streak: days, xp: Math.max(0, Number(xp) || 0), pace: averagePace(timing) },
  };
}

/* ── standings ─────────────────────────────────────────────────────────── */

/* ── points ────────────────────────────────────────────────────────────────
   The overall rating shown as a whole number out of 1000. Out of 100, two
   players on 52.04 and 52.01 would both show "52" while holding different
   places — a board that does not read in order. Ten times the resolution
   makes a shown tie rare, and the board ranks on the shown number anyway, so
   equal points always share a place. */
export const POINTS_MAX = 1000;

export function points(overall) {
  return Number.isFinite(overall) ? Math.round(overall * 10) : 0;
}

/**
 * The rating and its three filters. "overall" — points, the mix above — is
 * the rating, and the only rank anyone holds. The other three re-sort the
 * same players by one part of the points, to show who leads it; the app
 * presents them as filters, never as ranks of their own. `column` heads the
 * value column when that view is showing.
 */
export const BOARDS = [
  { id: "overall", name: "Points", column: "Points" },
  { id: "streak", name: "Day streak", column: "Days" },
  { id: "xp", name: "XP", column: "XP" },
  { id: "speed", name: "Time", column: "Avg. time" },
];

/**
 * What each board is sorted by — always the number it shows, with higher
 * meaning better.
 *
 * The component boards rank on raw values, not on the 0-100 scores. A board
 * must read in order: the speed board once ranked on the type-adjusted score
 * while showing plain seconds, and put a 5.5s player below a 7.2s one, which
 * is right by the maths and looks broken to anyone reading it. So the speed
 * board is a plain stopwatch, and the allowance for typing lives where it
 * matters — in the overall rating, where speed is only one part of the mix.
 * Raw values also make ties exact: two people on 14 days share a place.
 */
export function boardValue(board, rating) {
  if (!rating) return null;
  if (board === "streak") return rating.raw?.streak ?? null;
  if (board === "xp") return rating.raw?.xp ?? null;
  if (board === "speed") {
    const pace = rating.raw?.pace;
    return Number.isFinite(pace) && pace > 0 ? -pace : null;
  }
  return Number.isFinite(rating.overall) ? points(rating.overall) : null;
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

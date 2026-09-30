// How a user is rated.
//
// Points come from three things, and their weights are their order of
// importance:
//
//   discipline  50%  the day streak: did you turn up, day after day
//   mastery     30%  right and wrong answers: how much you have shown you know
//   speed       20%  how quickly you answer what you do know
//
// Underneath all three is one idea. The rating is meant to say what is in a
// person's head, and there are three ways to answer a question correctly
// without it being there: to guess, to look it up, and to have answered the
// same question so often that it is recalled rather than known.
//
//   - A guess. Half of all questions here have two options, so a random tap
//     is right half the time. A wrong answer therefore costs as much as a
//     right one earns, and guessing is worth nothing on average.
//   - A look-up. It takes time; recall does not. An answer earns less and
//     less the longer it took, down to a small share for one that took a
//     minute. The clock stops at the answer, so reading the explanation
//     afterwards is never counted. An answer given faster than the question
//     can be read is a reflex tap, and earns nothing.
//   - A repeat. The second right answer to a question earns half of the
//     first, the third a quarter, so no question can be farmed.
//
// Every curve saturates. A linear score would make a 300-day streak worth
// three hundred one-day streaks, which would put the board permanently out of
// reach of anyone who started this month and make it pointless to look at.
// Saturating curves keep first place winnable while still separating people
// who are close together.
//
// This file is the only place scores are computed. The app scores the local
// player and every leaderboard entry with the same functions, from raw
// numbers, so there is one algorithm and it cannot drift.

/* ── what an answer is worth ───────────────────────────────────────────────
   XP is the running count of what you have done. A gap question is harder
   than a two-option one in a way that is not arguable: multiple choice hands
   you the answer and asks you to recognise it, and typing means producing it
   from nothing. So it pays more.

   A wrong answer still pays, for the reason the XP sheet gives: reading why
   you were wrong is the part that works, and the app should not fine you for
   trying the harder question.

   A right answer pays its full amount only when it was quick. Slow, it pays
   a third: someone who looks every answer up would otherwise pile up XP as
   fast as someone who knows them. */
export const XP = {
  gapCorrect: 15,
  binaryCorrect: 10,
  wrong: 2,
};

/** The share of a right answer's XP that even the slowest one keeps. */
const XP_FLOOR = 0.3;

/* ── time ──────────────────────────────────────────────────────────────────
   How quickly a right answer was given, as a credit from 1 (as quick as
   knowing it is) down to `floor` (as slow as looking it up).

   Up to `free` seconds it is 1: reading the question and choosing takes a
   moment, and below that the difference is thumbs, not knowledge. Past it the
   credit falls away by a factor e every `decay` seconds and never quite
   reaches zero, because a slow right answer is still a right answer. Typing
   takes longer than tapping however well you know it, so it has more room.

   A long question and a picture take longer to read, and get that time back. */
export const TIME = {
  binary: { free: 4, decay: 8 },
  gap: { free: 12, decay: 16 },
  floor: 0.15,
};

const stemLength = (q) => String(q?.q || "").length;

/** Extra seconds a question needs simply to be read: a picture, a long stem. */
export function readingAllowance(q) {
  return (q?.img ? 3 : 0) + Math.min(4, Math.max(0, (stemLength(q) - 60) / 40));
}

/**
 * The fastest a tapped answer can honestly be: a little over the time it
 * takes to read the stem. Faster is a reflex, not an answer.
 */
export function reflexSeconds(q) {
  return 0.7 + stemLength(q) / 60;
}

/**
 * The time credit of a right answer, 0 to 1. `seconds` is how long the
 * question was up before it was answered, and nothing after; when that is
 * not known the answer counts as the slowest there is.
 */
export function timeCredit(q, seconds) {
  const type = q?.type === "gap" ? "gap" : "binary";
  if (!Number.isFinite(seconds) || seconds <= 0) return TIME.floor;
  if (type === "binary" && seconds < reflexSeconds(q)) return 0;
  const { free, decay } = TIME[type];
  const over = Math.max(0, seconds - free - readingAllowance(q));
  return Math.max(TIME.floor, Math.exp(-over / decay));
}

/** What one answer earns in XP. */
export function xpFor(question, correct, seconds) {
  if (!correct) return XP.wrong;
  const base = question?.type === "gap" ? XP.gapCorrect : XP.binaryCorrect;
  return Math.round(base * (XP_FLOOR + (1 - XP_FLOOR) * timeCredit(question, seconds)));
}

/* ── what an answer proves ─────────────────────────────────────────────────
   Each answer moves two running totals, both kept in hundredths so they add
   exactly and travel as whole numbers:

     credit  net knowledge shown. A right answer adds its time credit (a typed
             one 1.5 times that: it cannot be guessed); a wrong tapped answer
             takes away 1, which is exactly what a guess is worth on a
             two-option question. A wrong typed answer takes nothing away: a
             typed guess is never right by luck. A repeat of a question already
             answered right is worth half as much for each time before.
     fluent  the time credits of the right answers, for their average.

   So credit is positive only for someone who answers correctly more often
   than chance, and quickly, and it can be raised by nothing but knowing
   things. */
export const REPEAT = 0.5;

/**
 * What one answer adds to the two totals, as plain numbers (not hundredths):
 * { credit, fluent }. `timesRight` is how many times this question has
 * already been answered right.
 */
export function knowledgeFor(question, correct, seconds, timesRight = 0) {
  const gap = question?.type === "gap";
  if (!correct) return { credit: gap ? 0 : -1, fluent: 0 };
  const t = timeCredit(question, seconds);
  return { credit: (gap ? 1.5 : 1) * REPEAT ** Math.max(0, timesRight) * t, fluent: t };
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

/* ── mastery ───────────────────────────────────────────────────────────────
   From net credit alone, so it grows only with right answers, given quickly,
   beyond what guessing would give. 1,200 credit is 63: about 1,800 answers at
   88% and a few seconds each, a month of steady work. Someone who guesses,
   looks things up or repeats the same few questions never gets there. */
export const MASTERY_SCALE = 1200;

export function masteryScore(credit) {
  const k = Math.max(0, Number(credit) || 0) / 100;
  return 100 * (1 - Math.exp(-k / MASTERY_SCALE));
}

/* ── speed ─────────────────────────────────────────────────────────────────
   How quick the right answers were, on average, from the same time credits
   that shape XP and mastery: 100 for someone whose right answers are all as
   quick as knowing them, 0 for all as slow as looking them up.

   It counts only as far as the mastery behind it. Speed on a handful of
   answers, or on answers that were mostly guesses, is not evidence of
   anything, so it is scaled by how much net credit there is: nothing at 0,
   most of the way by 800. Without that, one lucky quick tap would earn the
   whole share, and so would tapping at random as fast as possible. */
export const SPEED_EVIDENCE = 400;

/** The mean time credit of the right answers, 0 to 1, or null if none was timed. */
export function meanCredit({ fluent = 0, timing = {} } = {}) {
  const n = (Number(timing.binaryN) || 0) + (Number(timing.gapN) || 0);
  if (!n) return null;
  return Math.min(1, Math.max(0, (Number(fluent) || 0) / 100 / n));
}

export function speedScore({ credit = 0, fluent = 0, timing = {} } = {}) {
  const mean = meanCredit({ fluent, timing });
  if (mean === null) return 0;
  const skill = Math.min(1, Math.max(0, (mean - TIME.floor) / (1 - TIME.floor)));
  const evidence = 1 - Math.exp(-(Math.max(0, Number(credit) || 0) / 100) / SPEED_EVIDENCE);
  return 100 * skill * evidence;
}

/** The plain average time of the right answers, in ms, for display. */
export function averagePace({ binaryMs = 0, binaryN = 0, gapMs = 0, gapN = 0 } = {}) {
  const n = binaryN + gapN;
  if (!n) return null;
  return (binaryMs * binaryN + gapMs * gapN) / n;
}

/* ── the mix ───────────────────────────────────────────────────────────────
   Showing up beats being right beats being quick, which is the order asked
   for and also the order that matches how anyone actually passes this exam.
   A streak on its own can never pass half the points, and the other half
   cannot be had without the work. */
export const WEIGHTS = { streak: 0.5, mastery: 0.3, speed: 0.2 };

/** One number out of 100. */
export function overallScore({ streak = 0, mastery = 0, speed = 0 }) {
  return streak * WEIGHTS.streak + mastery * WEIGHTS.mastery + speed * WEIGHTS.speed;
}

/**
 * Every score for one player, from the raw numbers.
 *
 *   { streak, lastDay, xp, credit, fluent, timing }  →  { streak, mastery, speed, overall, raw }
 *
 * `today` is a day index or YYYY-MM-DD; the streak is only counted if it is
 * still alive on that day. `credit` and `fluent` are the two running totals
 * above, in hundredths.
 */
export function rate({ streak = 0, lastDay = null, xp = 0, credit = 0, fluent = 0, timing = {} } = {}, today) {
  const days = liveStreak(streak, lastDay, today);
  const parts = {
    streak: streakScore(days),
    mastery: masteryScore(credit),
    speed: speedScore({ credit, fluent, timing }),
  };
  return {
    ...parts,
    overall: overallScore(parts),
    raw: {
      streak: days,
      xp: Math.max(0, Number(xp) || 0),
      pace: averagePace(timing),
      credit: Math.round(Math.max(0, Number(credit) || 0)) / 100,
    },
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
 * Net credit (see above) someone needs before they are on the time board. It
 * is a plain stopwatch, and a stopwatch can be won by tapping at random as
 * fast as the screen allows; a few hundred points of net credit means the
 * answers behind the time were right.
 */
export const SPEED_BOARD_MIN = 100;

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
    if (!(rating.raw?.credit >= SPEED_BOARD_MIN)) return null;
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

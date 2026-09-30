// Who a player is, and whether a score they report is possible.
//
// Every player is ranked automatically: the app sends its score to the
// rating server (worker/) whenever it changes, together with Telegram's
// signed launch data. The server checks that signature, so *who* sent a score
// cannot be faked. The numbers themselves come from the player's own app, so
// checkScore rejects anything impossible — a streak older than the app, more
// XP than the answers could earn — which stops junk and casual editing. It
// cannot stop a determined person from inventing a plausible score, and
// nothing short of replaying every answer on the server could. The board is a
// friendly ranking, not an exam.
//
// Imported by the app and by the server, so it must stay plain JS with no
// browser or Node APIs.

import { XP, dayIndex } from "./rating.js";

/** The first day the app existed. No streak can be longer than it has been around. */
export const LAUNCH_DAY = dayIndex("2026-08-20");

// One timed answer is clamped to this range when it is recorded, so the same
// range is the only thing a real average can fall in.
export const PACE_MIN_MS = 400;
export const PACE_MAX_MS = 60000;

/** FNV-1a, 32 bit. Not cryptographic; it only has to spread values out. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A short stable key for a Telegram user.
 *
 * The server stores players under this rather than their raw Telegram id,
 * and the app uses it to recognise its own row. It is not a secret — ids are
 * small numbers and a hash of one can be reversed by trying them all — it
 * just keeps raw ids out of the database. 64 bits from two passes, so two
 * players colliding is not a practical concern.
 */
export function playerKey(userId) {
  if (userId === null || userId === undefined || userId === "") return null;
  const s = String(userId);
  const reversed = [...s].reverse().join("");
  return fnv(s).toString(36) + fnv(`~${reversed}`).toString(36);
}

// Control characters, zero-width marks and bidirectional overrides. Names come
// from other people's profiles and are shown to everyone, so none of these
// may reach the page — an override character can make a name read backwards
// or run into the next column.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;
export const clean = (s) => String(s || "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

/** Longest name kept. The screen shortens further with an ellipsis. */
export const NAME_MAX = 40;

/**
 * What the board shows for someone: the name exactly as they wrote it on
 * Telegram, first and last. The id is never shown.
 */
export function displayName(from) {
  const name = [clean(from?.first_name), clean(from?.last_name)].filter(Boolean).join(" ") || "Player";
  return [...name].slice(0, NAME_MAX).join("");
}

/** Telegram's own rule for a username, so nothing else can pass as one. */
export const USERNAME = /^[A-Za-z0-9_]{4,32}$/;

/** Their @username, or null if they have not set one. */
export function usernameOf(from) {
  const u = String(from?.username || "");
  return USERNAME.test(u) ? u : null;
}

const count = (n) => Number.isInteger(n) && n >= 0;

/**
 * Take a score as the app sent it and decide whether it is possible.
 *
 *   { streak, lastDay, xp, answered, timing: { binaryMs, binaryN, gapMs, gapN },
 *     credit, fluent }
 *
 * credit and fluent are the two running totals the rating is built from (see
 * rating.js), in hundredths; credit can be negative, for someone who has
 * answered worse than chance. An app from before they existed sends neither,
 * and is stored with the totals it already had.
 *
 * lastDay is a day index (see rating.dayIndex), or null for someone who has
 * never studied. `today` is the server's own day index — never the app's,
 * which is the part that could be edited.
 *
 * Returns { ok: true, score } with every field a whole number, or
 * { ok: false, reason } — the reason is for the server log, not for users.
 */
export function checkScore(raw, today) {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "no score" };
  const t = raw.timing && typeof raw.timing === "object" ? raw.timing : {};
  const n = {
    streak: raw.streak, lastDay: raw.lastDay ?? 0, xp: raw.xp, answered: raw.answered,
    binaryMs: t.binaryMs ?? 0, binaryN: t.binaryN ?? 0, gapMs: t.gapMs ?? 0, gapN: t.gapN ?? 0,
  };
  for (const [field, value] of Object.entries(n)) {
    if (!count(value)) return { ok: false, reason: `bad ${field}` };
  }

  // A streak cannot outlast the app, and cannot end in the future.
  if (n.streak > today - LAUNCH_DAY + 1) return { ok: false, reason: "streak longer than the app has existed" };
  if (n.streak > 0 && (n.lastDay > today + 1 || n.lastDay < LAUNCH_DAY - 1)) {
    return { ok: false, reason: "last study day out of range" };
  }

  // XP is earned per answer, and no answer is worth more than a typed one.
  if (n.xp > n.answered * XP.gapCorrect) return { ok: false, reason: "more XP than answers allow" };
  // Only correct answers are timed, so there cannot be more timings than answers.
  if (n.binaryN + n.gapN > n.answered) return { ok: false, reason: "more timings than answers" };
  if (n.answered > 1_000_000) return { ok: false, reason: "implausible answer count" };

  // Net credit is at most 1.5 an answer (a typed answer, given quickly, the
  // first time) and at least -1 (a wrong tap); the time credits it averages
  // are at most 1 each, one for every timed answer.
  let credit = null;
  let fluent = null;
  if (raw.credit !== undefined || raw.fluent !== undefined) {
    if (!Number.isInteger(raw.credit) || !Number.isInteger(raw.fluent)) return { ok: false, reason: "bad credit" };
    if (raw.credit < -100 * n.answered || raw.credit > 150 * n.answered) return { ok: false, reason: "credit out of range" };
    if (raw.fluent < 0 || raw.fluent > 100 * (n.binaryN + n.gapN)) return { ok: false, reason: "fluency out of range" };
    credit = raw.credit;
    fluent = raw.fluent;
  }

  for (const [ms, c, label] of [[n.binaryMs, n.binaryN, "tapped"], [n.gapMs, n.gapN, "typed"]]) {
    if (c > 0 && (ms < PACE_MIN_MS || ms > PACE_MAX_MS)) return { ok: false, reason: `${label} pace out of range` };
  }

  return {
    ok: true,
    score: {
      streak: n.streak, lastDay: n.lastDay, xp: n.xp, answered: n.answered,
      timing: { binaryMs: n.binaryMs, binaryN: n.binaryN, gapMs: n.gapMs, gapN: n.gapN },
      credit, fluent,
    },
  };
}

/* ── what a student in a class also shares ─────────────────────────────────
   A player in a classroom sends two more numbers, so their teacher can see
   accuracy and weak topics: how many answers were right, and right/wrong
   per category. Only while they belong to a class; never bookmarks. */

const TAG = /^[A-Za-z0-9_-]{1,30}$/;
export const TOPICS_MAX = 40;

/**
 * The shared detail, checked against the score it came with; or null if
 * anything in it is impossible. Returns { correct, topics } with topics as
 * the JSON text the server stores.
 */
export function checkDetail(raw, answered) {
  if (!raw || typeof raw !== "object") return null;
  if (!count(raw.correct) || raw.correct > answered) return null;
  const topics = {};
  const entries = raw.topics && typeof raw.topics === "object" ? Object.entries(raw.topics) : [];
  if (entries.length > TOPICS_MAX) return null;
  for (const [tag, v] of entries) {
    // Every answer is counted in each category of its question, so no one
    // category can hold more answers than there are in all.
    if (!TAG.test(tag) || !Array.isArray(v) || v.length !== 2 || !v.every(count) || v[0] + v[1] > answered) return null;
    topics[tag] = [v[0], v[1]];
  }
  return { correct: raw.correct, topics: JSON.stringify(topics) };
}

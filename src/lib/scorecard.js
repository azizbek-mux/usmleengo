// The score a player sends to the leaderboard, packed into a bot start link.
//
// There is no server, so the only way a score leaves the phone is the user
// tapping a link to the bot: t.me/usmleengo_bot?start=<payload>. Telegram then
// shows a Start button, and pressing it sends "/start <payload>" to the bot,
// with the sender's identity attached by Telegram itself. The scheduled build
// reads those messages (tools/fetch-leaderboard.mjs) and publishes the board.
//
// So *who* sent a score cannot be faked, but the numbers are whatever the
// payload says. Decoding therefore checks that they are possible — nobody has
// a longer streak than the app has existed, or more XP than their answers
// could earn — which stops junk and hand-edited links. It does not stop a
// determined person from building a plausible false score, and nothing
// without a server could. The board is a friendly ranking, not an exam.
//
// Imported by both the app and the build script, so it must stay plain JS
// with no browser or Node APIs.

import { XP, dayIndex } from "./rating.js";

/** The first day the app existed. No streak can be longer than it has been around. */
export const LAUNCH_DAY = dayIndex("2026-08-20");

const VERSION = "r1";
const LEAVE = `${VERSION}_leave`;

// Telegram caps a start parameter at 64 characters of [A-Za-z0-9_-].
export const MAX_PAYLOAD = 64;

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
 * The board is a public file, and there is no reason to publish a list of raw
 * Telegram user ids beside first names. This is not a secret — ids are small
 * numbers and a hash of one can be reversed by trying them all — it just keeps
 * the published file from being a ready-made list. 64 bits from two passes,
 * so two players colliding is not a practical concern.
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
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
const clean = (s) => String(s || "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

/** Longest name the board keeps. The screen shortens further with an ellipsis. */
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

const FIELDS = ["streak", "lastDay", "xp", "answered", "binaryMs", "binaryN", "gapMs", "gapN"];

function check(body) {
  return (fnv(`${VERSION}:${body}`) % (36 ** 3)).toString(36).padStart(3, "0");
}

const int = (n) => Math.max(0, Math.round(Number(n) || 0));

/**
 * Pack one player's raw numbers into a start-link payload.
 *
 *   { streak, lastDay, xp, answered, timing: { binaryMs, binaryN, gapMs, gapN } }
 *
 * lastDay is a day index (see rating.dayIndex). The trailing three characters
 * are a checksum — it catches a mistyped or hand-edited link, and nothing
 * more, since anyone reading this file can compute it.
 */
export function encodeScore({ streak, lastDay, xp, answered, timing = {} }) {
  const values = {
    streak, lastDay, xp, answered,
    binaryMs: timing.binaryMs, binaryN: timing.binaryN,
    gapMs: timing.gapMs, gapN: timing.gapN,
  };
  const body = FIELDS.map((f) => int(values[f]).toString(36)).join("_");
  const payload = `${VERSION}_${body}_${check(body)}`;
  return payload.length <= MAX_PAYLOAD ? payload : null;
}

/** The payload that asks to be taken off the board. */
export function leavePayload() {
  return LEAVE;
}

/**
 * Unpack a payload and decide whether it is possible.
 *
 * `sentDay` is the day index of the message's own date, from Telegram — not
 * from the payload, which is the part that could be edited.
 *
 * Returns { ok: true, leave: true }, { ok: true, score }, or
 * { ok: false, reason } — the reason is for the build log, not for users.
 */
export function decodeScore(payload, sentDay) {
  const text = String(payload || "").trim();
  if (text === LEAVE) return { ok: true, leave: true };

  const parts = text.split("_");
  if (parts[0] !== VERSION) return { ok: false, reason: "not a score" };
  if (parts.length !== FIELDS.length + 2) return { ok: false, reason: "wrong length" };

  const body = parts.slice(1, -1).join("_");
  if (check(body) !== parts[parts.length - 1]) return { ok: false, reason: "checksum" };

  const n = {};
  for (let i = 0; i < FIELDS.length; i++) {
    const raw = parts[i + 1];
    if (!/^[0-9a-z]{1,8}$/.test(raw)) return { ok: false, reason: `bad ${FIELDS[i]}` };
    n[FIELDS[i]] = parseInt(raw, 36);
  }

  // A streak cannot outlast the app, and cannot end in the future.
  const lived = sentDay - LAUNCH_DAY + 1;
  if (n.streak > lived) return { ok: false, reason: "streak longer than the app has existed" };
  if (n.streak > 0 && (n.lastDay > sentDay + 1 || n.lastDay < LAUNCH_DAY - 1)) {
    return { ok: false, reason: "last study day out of range" };
  }

  // XP is earned per answer, and no answer is worth more than a typed one.
  if (n.xp > n.answered * XP.gapCorrect) return { ok: false, reason: "more XP than answers allow" };
  // Only correct answers are timed, so there cannot be more timings than answers.
  if (n.binaryN + n.gapN > n.answered) return { ok: false, reason: "more timings than answers" };
  if (n.answered > 1_000_000) return { ok: false, reason: "implausible answer count" };

  for (const [ms, count, label] of [[n.binaryMs, n.binaryN, "tapped"], [n.gapMs, n.gapN, "typed"]]) {
    if (count > 0 && (ms < PACE_MIN_MS || ms > PACE_MAX_MS)) {
      return { ok: false, reason: `${label} pace out of range` };
    }
  }

  return {
    ok: true,
    score: {
      streak: n.streak,
      lastDay: n.lastDay,
      xp: n.xp,
      answered: n.answered,
      timing: { binaryMs: n.binaryMs, binaryN: n.binaryN, gapMs: n.gapMs, gapN: n.gapN },
    },
  };
}

/* ── the published board ───────────────────────────────────────────────────
   The shape of leaderboard.json. The build writes it; the build reads last
   build's copy back; the app reads it to rank against. All three go through
   sanitizeBoard, so none of them can be handed a malformed entry. */

export function emptyBoard() {
  return { version: 1, updatedAt: null, lastUpdateId: 0, players: {} };
}

const isCount = (n) => Number.isInteger(n) && n >= 0;

/**
 * Take last build's board back in, trusting nothing.
 *
 * It is this script's own output, but it came over the network, and a
 * half-written or tampered file must not be able to corrupt the next one.
 * Anything malformed is dropped rather than repaired.
 */
export function sanitizeBoard(raw) {
  const board = emptyBoard();
  if (!raw || typeof raw !== "object") return board;
  if (isCount(raw.lastUpdateId)) board.lastUpdateId = raw.lastUpdateId;
  if (typeof raw.updatedAt === "string") board.updatedAt = raw.updatedAt;

  const players = raw.players && typeof raw.players === "object" ? raw.players : {};
  for (const [key, p] of Object.entries(players)) {
    if (!/^[0-9a-z]{2,16}$/.test(key) || !p || typeof p !== "object") continue;
    const t = p.timing || {};
    const numbers = [p.streak, p.lastDay, p.xp, p.answered, p.sentAt,
      t.binaryMs, t.binaryN, t.gapMs, t.gapN];
    if (!numbers.every(isCount) || typeof p.name !== "string") continue;
    board.players[key] = {
      name: [...clean(p.name)].slice(0, NAME_MAX).join("") || "Player",
      ...(typeof p.username === "string" && USERNAME.test(p.username) ? { username: p.username } : {}),
      streak: p.streak, lastDay: p.lastDay, xp: p.xp, answered: p.answered,
      timing: { binaryMs: t.binaryMs, binaryN: t.binaryN, gapMs: t.gapMs, gapN: t.gapN },
      sentAt: p.sentAt,
    };
  }
  return board;
}

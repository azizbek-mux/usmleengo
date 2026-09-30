// The multiplayer game's rules, shared by the app and the game server.
//
// A game is a live round among friends: one player creates it, the others
// join through an invite link or a six-digit code, and everybody answers the
// same question at the same moment. It is only a game. Nothing that happens
// in one touches the player's own XP, streak, rating or question history,
// and nothing about it is kept once it ends.

import { XP } from "./rating.js";

export const MAX_PLAYERS = 50;
export const MIN_PLAYERS = 2;

/** What the creator can choose from. */
export const QUESTION_COUNTS = [5, 10, 15, 20, 30];
export const SECONDS = [5, 10, 15, 20, 25, 30];
export const GAME_TYPES = [
  { id: "binary", name: "Tap" },
  { id: "gap", name: "Typed" },
  { id: "mixed", name: "Mixed" },
];
export const DEFAULT_SETTINGS = { count: 10, seconds: 15, qtype: "binary" };

export const CODE_RE = /^\d{6}$/;

/**
 * Points for one answer.
 *
 * A correct answer is worth its XP — the same 10 for a tapped answer and 15
 * for a typed one that the app pays — times a hundred, so a game's numbers
 * read like a game's, times how fast it came: twice as much for an instant
 * answer, falling evenly to the plain amount at the last second. A wrong
 * answer is worth nothing.
 *
 *   10 × 100 × (1 + 12s left / 15s)  =  1,800
 */
export function gamePoints(type, correct, remainingMs, limitMs) {
  if (!correct) return 0;
  const base = (type === "gap" ? XP.gapCorrect : XP.binaryCorrect) * 100;
  const left = limitMs > 0 ? Math.min(1, Math.max(0, remainingMs / limitMs)) : 0;
  return Math.round(base * (1 + left));
}

/** The best a question can pay: an instant correct answer. */
export const maxPoints = (type) => gamePoints(type, true, 1, 1);

/** Fisher-Yates. */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The questions for one game, picked by the creator's app.
 *
 * Plain random, deliberately: the spaced repetition that steers a player's
 * own rounds has no place here — every game starts from nothing, and any
 * question in the chosen topics can come up, including ones the players
 * have answered before.
 *
 *   systems  - chosen organ systems; empty means every one of them
 *   subjects - chosen disciplines; empty means every one of them
 *   qtype    - "binary" (tap), "gap" (typed) or "mixed"
 *
 * The two lists narrow with "and", as they do on the Quiz tab: a game set
 * to Cardiovascular and Pharmacology asks about heart drugs.
 */
export function pickGameQuestions(bank, { systems = [], subjects = [], qtype = "binary", count = 10 } = {}) {
  const pool = inCategories(bank, systems, subjects)
    .filter((q) => qtype === "mixed" || q.type === qtype);
  return shuffle(pool).slice(0, count).map(forGame);
}

/** The questions left once both axes have been narrowed. */
function inCategories(list, systems, subjects) {
  const sys = new Set(systems);
  const sub = new Set(subjects);
  if (!sys.size && !sub.size) return list;
  return list.filter((q) => (!sys.size || sys.has(q.system)) && (!sub.size || sub.has(q.subject)));
}

/**
 * Only what a game needs of a question, in both languages.
 *
 * The English is the question itself; `uz` carries the Uzbek text beside it,
 * where the bank has a translation (q.uzt, from bilingualBank). The server
 * shows and grades each player in the language their app is in, so friends
 * who read different languages can play the same game together.
 */
export function forGame(q) {
  const out = { id: q.id, type: q.type, topic: q.topic, q: q.q, explain: q.explain || "" };
  if (q.hideTopic) out.hideTopic = true;
  if (q.img) out.img = q.img;
  if (q.type === "binary") {
    out.options = q.options;
    out.answer = q.answer;
  } else {
    out.answer = q.answer;
    out.accept = q.accept;
  }
  const uz = uzOf(q);
  if (uz) out.uz = uz;
  return out;
}

/**
 * The Uzbek half of a question. A two-option question's options are written
 * right-first in both languages, so the one `answer` index above holds for
 * either — and the server's shuffle moves both together. A picture question
 * has no wording to translate.
 */
function uzOf(q) {
  const u = q.uzt;
  if (!u) return null;
  const out = { topic: u.t, q: q.img ? q.q : u.q, explain: u.e || "" };
  if (u.h === 1) out.hideTopic = true;
  if (q.type === "binary") out.options = u.o;
  else {
    out.answer = u.a;
    out.accept = u.c;
  }
  return out;
}

/** How many questions a choice of categories and type can supply. */
export function availableFor(bank, { systems = [], subjects = [], qtype = "binary" } = {}) {
  return inCategories(bank, systems, subjects)
    .filter((q) => qtype === "mixed" || q.type === qtype).length;
}

/**
 * The invite link. Telegram opens the Mini App straight into the game: the
 * start parameter arrives as `start_param` in the launch data.
 */
export const inviteParam = (code) => `g${code}`;

export function codeFromParam(param) {
  const m = /^g(\d{6})$/.exec(String(param || ""));
  return m ? m[1] : null;
}

export const inviteLink = (appLink, code) => `${appLink}?startapp=${inviteParam(code)}`;

/** Places with ties shared, as on the rating: 1, 2, 2, 4. */
export function placesOf(scores) {
  return scores.map((s) => 1 + scores.filter((o) => o > s).length);
}

// The Medical English deck: daily limits, the study queue, and persistence.
//
// Scheduling itself lives in srs.js. This file owns everything around it —
// how many new cards a day the user has asked for, what is due right now, and
// getting that state onto disk and into the cloud without tripping over
// Telegram's storage limits.

import { cloudGetChunked, cloudSetChunked } from "./telegram.js";
import {
  DEFAULTS,
  LEARNING,
  NEW,
  RELEARNING,
  REVIEW,
  answer as srsAnswer,
  dayNumber,
  freshCard,
  isDue,
  minuteNumber,
} from "./srs.js";

const KEY = "usmleengo_english_v1";

export const emptyDeck = {
  config: { newPerDay: DEFAULTS.newPerDay, revPerDay: DEFAULTS.revPerDay },
  // cards[glossaryIndex] = { state, step, ease, ivl, due, lapses, reps }
  // Only cards the user has actually seen; everything else is implicitly new.
  cards: {},
  // Daily counters, reset when `day` no longer matches today.
  day: null,
  newDone: 0,
  revDone: 0,
  reviews: 0,
};

/* ── daily counters ──────────────────────────────────────────────────────── */

/** Roll the per-day counters over if the Anki day has changed since last time. */
export function rollDay(deck, today = dayNumber()) {
  if (deck.day === today) return deck;
  return { ...deck, day: today, newDone: 0, revDone: 0 };
}

/* ── encoding ──────────────────────────────────────────────────────────────
   Telegram CloudStorage caps a value at 4096 characters, so this is a compact
   string rather than JSON. One card is
       index : state : step : ease : interval : due : lapses
   all base 36, joined by ";". Roughly 20 characters a card, against about 90
   for the equivalent JSON. */

const b36 = (n) => Math.round(n).toString(36);
const from36 = (s) => parseInt(s, 36);

function encode(deck) {
  const parts = [];
  for (const [idx, c] of Object.entries(deck.cards)) {
    parts.push([
      b36(Number(idx)),
      c.state,
      c.step,
      b36(Math.round(c.ease * 100)),
      b36(c.ivl),
      b36(c.due),
      b36(c.lapses || 0),
    ].join(":"));
  }
  const { newPerDay, revPerDay } = deck.config;
  return [
    "2",
    newPerDay,
    revPerDay,
    deck.day ?? "",
    deck.newDone,
    deck.revDone,
    deck.reviews,
    parts.join(";"),
  ].join("|");
}

// Box intervals from the Leitner version this replaced, so a deck saved by the
// previous build is carried over rather than thrown away.
const V1_INTERVALS = [0, 1, 3, 7, 16, 35];

function decodeV1(body, reviews) {
  const cards = {};
  for (const part of body ? body.split(";") : []) {
    if (!part) continue;
    const [i, b, d] = part.split(":");
    const idx = from36(i);
    const box = Number(b);
    const due = from36(d);
    if (Number.isNaN(idx) || Number.isNaN(box) || Number.isNaN(due)) continue;
    // A box maps onto a review card with the interval that box represented.
    const ivl = Math.max(1, V1_INTERVALS[Math.min(box, V1_INTERVALS.length - 1)] || 1);
    cards[idx] = { state: REVIEW, step: 0, ease: DEFAULTS.startingEase, ivl, due, lapses: 0, reps: 1 };
  }
  return { ...emptyDeck, config: { ...emptyDeck.config }, cards, reviews: Number(reviews) || 0 };
}

function decode(raw) {
  if (!raw || typeof raw !== "string") return null;
  const fields = raw.split("|");

  if (fields[0] === "1") {
    // "1|reviews|lastDay|cards"
    return decodeV1(fields[3], fields[1]);
  }
  if (fields[0] !== "2") return null;

  const [, newPerDay, revPerDay, day, newDone, revDone, reviews, body] = fields;
  const cards = {};
  for (const part of body ? body.split(";") : []) {
    if (!part) continue;
    const [i, st, step, ease, ivl, due, lapses] = part.split(":");
    const idx = from36(i);
    if (Number.isNaN(idx)) continue;
    const state = Number(st);
    if (![LEARNING, REVIEW, RELEARNING].includes(state)) continue;
    cards[idx] = {
      state,
      step: Number(step) || 0,
      ease: Math.max(DEFAULTS.minEase, (from36(ease) || 250) / 100),
      ivl: from36(ivl) || 0,
      due: from36(due) || 0,
      lapses: from36(lapses) || 0,
      reps: 1,
    };
  }
  const clamp = (v, lo, hi, dflt) => Math.min(hi, Math.max(lo, Number(v) || dflt));
  return {
    config: {
      newPerDay: clamp(newPerDay, 0, 500, DEFAULTS.newPerDay),
      revPerDay: clamp(revPerDay, 0, 9999, DEFAULTS.revPerDay),
    },
    cards,
    day: day === "" ? null : Number(day),
    newDone: Number(newDone) || 0,
    revDone: Number(revDone) || 0,
    reviews: Number(reviews) || 0,
  };
}

/* ── persistence ───────────────────────────────────────────────────────────
   localStorage is written on every answer; the cloud write is debounced,
   because a card is answered every few seconds and each cloud write is a
   round trip per changed chunk. */

export function loadDeckLocal() {
  try {
    return decode(localStorage.getItem(KEY)) || structuredClone(emptyDeck);
  } catch {
    return structuredClone(emptyDeck);
  }
}

export async function loadDeckRemote(local) {
  const remote = decode(await cloudGetChunked(KEY));
  if (!remote) return local;
  // Most reviews wins, the same rule the quiz state uses.
  return remote.reviews >= local.reviews ? remote : local;
}

let cloudTimer = null;
let cloudPending = null;

export function saveDeck(deck) {
  const encoded = encode(deck);
  try {
    localStorage.setItem(KEY, encoded);
  } catch {
    /* private mode / quota — the cloud write may still land */
  }
  cloudPending = encoded;
  if (cloudTimer) clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    cloudTimer = null;
    const value = cloudPending;
    cloudPending = null;
    if (value != null) cloudSetChunked(KEY, value);
  }, 2000);
  return encoded;
}

/** Push any debounced write immediately — on leaving the section. */
export function flushDeck() {
  if (cloudTimer) {
    clearTimeout(cloudTimer);
    cloudTimer = null;
  }
  const value = cloudPending;
  cloudPending = null;
  if (value != null) return cloudSetChunked(KEY, value);
  return Promise.resolve(false);
}

export function resetDeck() {
  const fresh = structuredClone(emptyDeck);
  saveDeck(fresh);
  flushDeck();
  return fresh;
}

export function setConfig(deck, patch) {
  return { ...deck, config: { ...deck.config, ...patch } };
}

/* ── the queue ─────────────────────────────────────────────────────────── */

const cardOf = (deck, i) => deck.cards[i] || freshCard();

/**
 * Split the pool into Anki's three counts, honouring the daily limits.
 *
 * Learning cards are never limited — they are already in flight, and holding
 * them back would strand a half-learned card overnight.
 */
export function queueCounts(deck, pool, nowMs = Date.now()) {
  const today = dayNumber(nowMs);
  const nowMin = minuteNumber(nowMs);

  // Anki's red counter is every card in flight, not only the ones whose minute
  // has arrived — a card due in eight minutes is still work you owe today.
  let learning = 0;
  // ...of which, the ones that can actually be put on screen right now.
  let learnReady = 0;
  let reviewDue = 0;
  let fresh = 0;
  let seen = 0;
  let known = 0;

  for (const c of pool) {
    const card = deck.cards[c.i];
    if (!card) { fresh++; continue; }
    seen++;
    if (card.state === REVIEW) {
      if (card.due <= today) reviewDue++;
      if (card.ivl >= 21) known++;            // Anki calls 21 days "mature"
    } else {
      learning++;
      if (card.due - nowMin <= DEFAULTS.learnAheadMins) learnReady++;
    }
  }

  const newLeft = Math.max(0, deck.config.newPerDay - deck.newDone);
  const revLeft = Math.max(0, deck.config.revPerDay - deck.revDone);
  const newCount = Math.min(fresh, newLeft);
  const dueCount = Math.min(reviewDue, revLeft);

  return {
    total: pool.length,
    seen,
    known,
    // What the three counters on the deck screen show.
    newCount,
    learnCount: learning,
    dueCount,
    // Whether a card can be served this second — the counters can be non-zero
    // while every learning card is still a few minutes out.
    readyNow: newCount + dueCount + learnReady,
    // Context the counters alone do not convey.
    newRemaining: fresh,
    reviewBacklog: reviewDue,
    newLimited: fresh > newLeft,
    revLimited: reviewDue > revLeft,
  };
}

/**
 * The next card to show, or null when the deck is finished for now.
 *
 * Learning cards that are actually due come first. New and review cards are
 * then interleaved in proportion to how many of each remain, which is what
 * Anki's default "mix with reviews" does — studying all the reviews and then
 * a wall of new cards is a much worse hour.
 */
export function nextCard(deck, pool, nowMs = Date.now(), rand = Math.random) {
  const today = dayNumber(nowMs);
  const nowMin = minuteNumber(nowMs);

  const learning = [];
  const reviews = [];
  const fresh = [];

  for (const c of pool) {
    const card = deck.cards[c.i];
    if (!card) { fresh.push(c); continue; }
    if (card.state === REVIEW) {
      if (card.due <= today) reviews.push(c);
    } else {
      learning.push(c);
    }
  }

  const dueLearning = learning.filter((c) => deck.cards[c.i].due <= nowMin);
  if (dueLearning.length) {
    dueLearning.sort((a, b) => deck.cards[a.i].due - deck.cards[b.i].due);
    return dueLearning[0];
  }

  const newLeft = Math.max(0, deck.config.newPerDay - deck.newDone);
  const revLeft = Math.max(0, deck.config.revPerDay - deck.revDone);
  const takeNew = Math.min(fresh.length, newLeft);
  const takeRev = Math.min(reviews.length, revLeft);

  if (takeNew && takeRev) {
    return rand() < takeNew / (takeNew + takeRev) ? pickNew(fresh, rand) : pickReview(reviews, deck);
  }
  if (takeRev) return pickReview(reviews, deck);
  if (takeNew) return pickNew(fresh, rand);

  // Nothing left but a card that is about to come up — Anki shows it early
  // rather than ending the session on a technicality.
  const soon = learning
    .filter((c) => deck.cards[c.i].due - nowMin <= DEFAULTS.learnAheadMins)
    .sort((a, b) => deck.cards[a.i].due - deck.cards[b.i].due);
  return soon[0] || null;
}

/**
 * Unseen cards enter high-yield first, shuffled within a tier. The glossary is
 * stored alphabetically, so taking it in order opens a first session on
 * 17-alpha-hydroxylase and 2,3-bisphosphoglycerate.
 */
const YIELD_RANK = { high: 0, medium: 1, low: 2 };
function pickNew(fresh, rand) {
  let best = null;
  let bestKey = Infinity;
  for (const c of fresh) {
    // Rank primarily by yield, then by a stable per-card jitter, so the order
    // is varied but does not reshuffle on every render.
    const key = YIELD_RANK[c.yield] * 1000 + ((Math.imul(c.i + 1, 2654435761) >>> 0) % 1000);
    if (key < bestKey) { bestKey = key; best = c; }
  }
  return best;
}

/** Longest-overdue first, which is how Anki orders a review backlog. */
function pickReview(reviews, deck) {
  let best = reviews[0];
  for (const c of reviews) if (deck.cards[c.i].due < deck.cards[best.i].due) best = c;
  return best;
}

/* ── answering ─────────────────────────────────────────────────────────── */

/** The card record for a glossary entry, with its index attached for fuzz. */
export function stateOf(deck, i) {
  return { ...cardOf(deck, i), key: i };
}

/**
 * Apply an answer and move the daily counters.
 *
 * A card counts against the new limit the first time it is studied, and
 * against the review limit when it was a review card — matching what Anki
 * counts, so the numbers on the deck screen mean what an Anki user expects.
 */
export function answerCard(deck, i, grade, nowMs = Date.now()) {
  const rolled = rollDay(deck, dayNumber(nowMs));
  const before = deck.cards[i];
  const card = stateOf(rolled, i);
  const next = srsAnswer(card, grade, { now: nowMs, config: rolled.config });
  delete next.key;

  const wasNew = !before;
  const wasReview = before && before.state === REVIEW;

  return {
    ...rolled,
    cards: { ...rolled.cards, [i]: next },
    newDone: rolled.newDone + (wasNew ? 1 : 0),
    revDone: rolled.revDone + (wasReview ? 1 : 0),
    reviews: rolled.reviews + 1,
  };
}

export { NEW, LEARNING, REVIEW, RELEARNING, dayNumber };

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

/** Bounds for the two numbers the user types. */
export const NEW_MAX = 999;
export const REV_MAX = 9999;


export const emptyDeck = {
  // newPerDay is null until the user has been asked. It rides in the same
  // field as a number — an empty one on the wire — so decks written before
  // the question existed still read back as already answered.
  config: { newPerDay: null, revPerDay: DEFAULTS.revPerDay },
  // cards[cardId] = { state, step, ease, ivl, due, lapses, reps }
  // Keyed by the glossary's content hash, never by row position: trimming the
  // glossary shifts every index after the first change, which would silently
  // hand every schedule to the wrong word.
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
       id : state : step : ease : interval : due : lapses
   with the numbers in base 36, joined by ";". Roughly 25 characters a card,
   against about 95 for the equivalent JSON. */

const b36 = (n) => Math.round(n).toString(36);
const from36 = (s) => parseInt(s, 36);

function encode(deck) {
  const parts = [];
  for (const [id, c] of Object.entries(deck.cards)) {
    parts.push([
      id,
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
    "3",
    newPerDay ?? "",
    revPerDay,
    deck.day ?? "",
    deck.newDone,
    deck.revDone,
    deck.reviews,
    parts.join(";"),
  ].join("|");
}

function decode(raw) {
  if (!raw || typeof raw !== "string") return null;
  const fields = raw.split("|");

  // Versions 1 and 2 keyed cards by their position in an 8,479-card glossary
  // that no longer exists. Those positions cannot be mapped onto the trimmed
  // deck, and guessing would attach real schedules to the wrong words — worse
  // than starting over. They are discarded deliberately.
  if (fields[0] !== "3") return null;

  const [, newPerDay, revPerDay, day, newDone, revDone, reviews, body] = fields;
  const cards = {};
  for (const part of body ? body.split(";") : []) {
    if (!part) continue;
    const [id, st, step, ease, ivl, due, lapses] = part.split(":");
    if (!id) continue;
    const state = Number(st);
    if (![LEARNING, REVIEW, RELEARNING].includes(state)) continue;
    cards[id] = {
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
      newPerDay: newPerDay === "" ? null : clamp(newPerDay, 0, NEW_MAX, DEFAULTS.newPerDay),
      revPerDay: clamp(revPerDay, 0, REV_MAX, DEFAULTS.revPerDay),
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
  // Keep the daily limits — a reset clears progress, not preferences, and
  // re-asking "how many new cards a day?" would be a setup screen appearing
  // out of nowhere long after setup.
  const { config } = loadDeckLocal();
  const fresh = { ...structuredClone(emptyDeck), config };
  saveDeck(fresh);
  flushDeck();
  return fresh;
}

/** False until the user has answered "how many new cards a day?". */
export const isConfigured = (deck) => deck.config.newPerDay !== null;

/** The limit to actually apply — the default stands in until they are asked. */
const newLimit = (deck) => deck.config.newPerDay ?? DEFAULTS.newPerDay;

export function setConfig(deck, patch) {
  const next = { ...deck.config, ...patch };
  if (next.newPerDay != null) {
    next.newPerDay = Math.min(NEW_MAX, Math.max(0, Math.round(next.newPerDay)));
  }
  next.revPerDay = Math.min(REV_MAX, Math.max(0, Math.round(next.revPerDay)));
  return { ...deck, config: next };
}

/* ── the queue ─────────────────────────────────────────────────────────── */

const cardOf = (deck, id) => deck.cards[id] || freshCard();

/** A number derived from the card id, used only to seed the scheduler's fuzz. */
function seedOf(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

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
    const card = deck.cards[c.id];
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

  const newLeft = Math.max(0, newLimit(deck) - deck.newDone);
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
    const card = deck.cards[c.id];
    if (!card) { fresh.push(c); continue; }
    if (card.state === REVIEW) {
      if (card.due <= today) reviews.push(c);
    } else {
      learning.push(c);
    }
  }

  const dueLearning = learning.filter((c) => deck.cards[c.id].due <= nowMin);
  if (dueLearning.length) {
    dueLearning.sort((a, b) => deck.cards[a.id].due - deck.cards[b.id].due);
    return dueLearning[0];
  }

  const newLeft = Math.max(0, newLimit(deck) - deck.newDone);
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
    .filter((c) => deck.cards[c.id].due - nowMin <= DEFAULTS.learnAheadMins)
    .sort((a, b) => deck.cards[a.id].due - deck.cards[b.id].due);
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
    const key = YIELD_RANK[c.yield] * 1000 + (seedOf(c.id) % 1000);
    if (key < bestKey) { bestKey = key; best = c; }
  }
  return best;
}

/** Longest-overdue first, which is how Anki orders a review backlog. */
function pickReview(reviews, deck) {
  let best = reviews[0];
  for (const c of reviews) if (deck.cards[c.id].due < deck.cards[best.id].due) best = c;
  return best;
}

/* ── answering ─────────────────────────────────────────────────────────── */

/** The card record for a glossary entry, with its fuzz seed attached. */
export function stateOf(deck, id) {
  return { ...cardOf(deck, id), key: seedOf(id) };
}

/**
 * Apply an answer and move the daily counters.
 *
 * A card counts against the new limit the first time it is studied, and
 * against the review limit when it was a review card — matching what Anki
 * counts, so the numbers on the deck screen mean what an Anki user expects.
 */
export function answerCard(deck, id, grade, nowMs = Date.now()) {
  const rolled = rollDay(deck, dayNumber(nowMs));
  const before = deck.cards[id];
  const card = stateOf(rolled, id);
  const next = srsAnswer(card, grade, { now: nowMs, config: rolled.config });
  delete next.key;

  const wasNew = !before;
  const wasReview = before && before.state === REVIEW;

  return {
    ...rolled,
    cards: { ...rolled.cards, [id]: next },
    newDone: rolled.newDone + (wasNew ? 1 : 0),
    revDone: rolled.revDone + (wasReview ? 1 : 0),
    reviews: rolled.reviews + 1,
  };
}

export { NEW, LEARNING, REVIEW, RELEARNING, dayNumber };

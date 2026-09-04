// Flashcard scheduling and persistence for the Medical English section.
//
// A Leitner box system: a card you get right moves up a box and comes back
// later; a card you miss drops to the bottom and comes back today. It is what
// Anki does, minus the per-card ease factor — which needs far more review
// history than a vocabulary drill ever accumulates to mean anything.
//
// Progress lives under its own storage key. Keeping it out of the quiz state
// means a glossary of 8,479 cards can never crowd out a user's XP and streak.

import { cloudGetChunked, cloudSetChunked } from "./telegram.js";

const KEY = "usmleengo_english_v1";

// Days until a card in each box comes back. Box 0 is "seen it, got it wrong",
// which is due immediately; box 5 is retired but never permanently — a word
// you have not touched in five weeks is worth one more look.
const INTERVALS = [0, 1, 3, 7, 16, 35];
export const TOP_BOX = INTERVALS.length - 1;

/** Whole days since the epoch, from the local calendar date. */
export function dayNumber(date = new Date()) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000,
  );
}

export const emptyDeck = {
  // box[cardIndex] = [box, dueDay] — only cards the user has actually seen.
  box: {},
  reviews: 0,
  lastDay: null,
};

/* ── compact encoding ──────────────────────────────────────────────────────
   Telegram CloudStorage caps a value at 4096 characters, so JSON is not an
   option past a few hundred cards. One card is "index:box:due", all in base
   36 — about 11 characters — and the payload is chunked across keys. */

function encode(deck) {
  const parts = [];
  for (const [idx, [box, due]] of Object.entries(deck.box)) {
    parts.push(`${Number(idx).toString(36)}:${box}:${due.toString(36)}`);
  }
  return `1|${deck.reviews}|${deck.lastDay || ""}|${parts.join(";")}`;
}

function decode(raw) {
  if (!raw || typeof raw !== "string") return null;
  const [version, reviews, lastDay, body] = raw.split("|");
  if (version !== "1") return null;

  const box = {};
  if (body) {
    for (const part of body.split(";")) {
      if (!part) continue;
      const [i, b, d] = part.split(":");
      const idx = parseInt(i, 36);
      const bx = Number(b);
      const due = parseInt(d, 36);
      if (Number.isNaN(idx) || Number.isNaN(bx) || Number.isNaN(due)) continue;
      box[idx] = [Math.min(TOP_BOX, Math.max(0, bx)), due];
    }
  }
  return { box, reviews: Number(reviews) || 0, lastDay: lastDay || null };
}

/** Synchronous read for first paint. */
export function loadDeckLocal() {
  try {
    return decode(localStorage.getItem(KEY)) || { ...emptyDeck, box: {} };
  } catch {
    return { ...emptyDeck, box: {} };
  }
}

/**
 * Async read that prefers whichever copy has seen more reviews — the same
 * "most progress wins" rule the quiz state uses, for the same reason: a user
 * who studied offline on a second device must not lose that work.
 */
export async function loadDeckRemote(local) {
  const raw = await cloudGetChunked(KEY);
  const remote = decode(raw);
  if (!remote) return local;
  return remote.reviews >= local.reviews ? remote : local;
}

export function saveDeck(deck) {
  const encoded = encode(deck);
  try {
    localStorage.setItem(KEY, encoded);
  } catch {
    /* private mode / quota — the cloud write may still land */
  }
  cloudSetChunked(KEY, encoded);
}

export function resetDeck() {
  const fresh = { ...emptyDeck, box: {} };
  saveDeck(fresh);
  return fresh;
}

/* ── scheduling ─────────────────────────────────────────────────────────── */

/**
 * Record one answer.
 *
 * "again" sends the card back to box 0 rather than down one step: a word you
 * could not recall is a word you do not know, whatever you knew last week.
 */
export function rate(deck, cardIndex, grade) {
  const [box] = deck.box[cardIndex] || [0, 0];
  const today = dayNumber();

  let next;
  if (grade === "again") next = 0;
  else if (grade === "easy") next = Math.min(TOP_BOX, box + 2);
  else next = Math.min(TOP_BOX, box + 1);

  return {
    ...deck,
    reviews: deck.reviews + 1,
    lastDay: today,
    box: { ...deck.box, [cardIndex]: [next, today + INTERVALS[next]] },
  };
}

/** Cards due now: everything unseen, plus everything whose interval elapsed. */
export function due(cards, deck, today = dayNumber()) {
  return cards.filter((c) => {
    const entry = deck.box[c.i];
    return !entry || entry[1] <= today;
  });
}

/**
 * Build a study round.
 *
 * Cards already in circulation come first and unseen cards fill the rest, so
 * a user who keeps starting rounds finishes what they started rather than
 * being handed 8,479 new words.
 */
export function buildRound(pool, deck, count, today = dayNumber()) {
  const seen = [];
  const fresh = [];
  for (const c of pool) {
    const entry = deck.box[c.i];
    if (!entry) fresh.push(c);
    else if (entry[1] <= today) seen.push(c);
  }
  // Lowest box first — the words being actively missed lead the round.
  seen.sort((a, b) => deck.box[a.i][0] - deck.box[b.i][0]);

  // Unseen cards enter high-yield first, randomised within a tier. The
  // glossary is stored alphabetically, so taking it in order would open every
  // new user's first session on 17-alpha-hydroxylase and 2,3-bisphosphoglycerate.
  // Shuffle then sort: Array.sort is stable, so the tiers keep their shuffle.
  const rank = { high: 0, medium: 1, low: 2 };
  const queue = shuffle(fresh).sort((a, b) => rank[a.yield] - rank[b.yield]);

  const round = [...seen.slice(0, count)];
  for (const c of queue) {
    if (round.length >= count) break;
    round.push(c);
  }
  return shuffle(round);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Headline numbers for the deck screen.
 *
 * `due` counts only cards already in circulation whose interval has elapsed —
 * a real review debt. Unseen cards are counted separately as `fresh`: calling
 * all 8,479 of them "due" on day one is a number nobody can act on.
 */
export function deckStats(cards, deck, today = dayNumber()) {
  let learning = 0;
  let known = 0;
  let dueReview = 0;
  let fresh = 0;

  for (const c of cards) {
    const entry = deck.box[c.i];
    if (!entry) { fresh++; continue; }
    const [box, dueDay] = entry;
    if (box >= TOP_BOX) known++;
    else learning++;
    if (dueDay <= today) dueReview++;
  }

  return {
    total: cards.length,
    studied: learning + known,
    learning,
    known,
    fresh,
    due: dueReview,
    // What a round can actually draw from right now.
    available: dueReview + fresh,
    reviews: deck.reviews,
  };
}

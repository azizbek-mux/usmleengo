// The Medical English glossary the flashcard section reads.
//
// Do not edit glossary.json by hand — it is compiled from
// clinical-english-glossary.csv by `npm run compile:glossary`.
//
// Fetched lazily, and only when the user opens Medical English. It is ~2 MB,
// which is fine as a one-off for someone who wants it and pure waste for
// someone who only ever does quizzes. The question bank loads on boot; this
// does not.

import { GLOSSARY_VERSION } from "./glossary-version.js";

const cards = [];

let pending = null;

/** Populates the deck in place and resolves once ready. */
export function loadGlossary() {
  if (cards.length) return Promise.resolve(cards);

  // Single-file builds inline the glossary, as they do the question bank.
  if (typeof window !== "undefined" && Array.isArray(window.__GLOSSARY__)) {
    cards.push(...window.__GLOSSARY__);
    return Promise.resolve(cards);
  }

  if (pending) return pending;

  const url = `${import.meta.env.BASE_URL}glossary.json?v=${GLOSSARY_VERSION}`;
  pending = fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`${res.status} loading glossary`);
      return res.json();
    })
    .then((data) => {
      const { rows, yields } = data;
      // `id` is the card's identity — a hash of the English term, assigned by
      // the compiler. Progress is stored against it, so editing the glossary
      // cannot reassign anyone's schedule to a different word. `i` is only a
      // position, useful for keys and ordering.
      rows.forEach(([id, term, ipa, uz, def, yld], i) => {
        cards.push({ id, i, term, ipa, uz, def, yield: yields[yld] });
      });
      return cards;
    })
    .catch((err) => {
      pending = null; // allow a retry
      throw err;
    });

  return pending;
}

export const loaded = () => cards.length > 0;

/**
 * Substring search over the English term and the Uzbek translation, so a
 * learner can look a word up from either side.
 */
export function findCards(query, limit = 40) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = [];
  const contains = [];
  for (const c of cards) {
    const t = c.term.toLowerCase();
    if (t.startsWith(q)) starts.push(c);
    else if (t.includes(q) || c.uz.toLowerCase().includes(q)) contains.push(c);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export default cards;

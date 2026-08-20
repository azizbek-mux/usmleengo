// Session building and answer grading.

import bank from "../data/bank.js";

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
 * Spaced-repetition weight. Questions the user got wrong come back often,
 * questions they have nailed repeatedly fade out but never vanish.
 */
function weight(q, seen) {
  const [correct, wrong] = seen[q.id] || [0, 0];
  if (correct === 0 && wrong === 0) return 3; // unseen — favour it
  return 1 + wrong * 2.5 - Math.min(correct, 4) * 0.4;
}

/** Weighted sample without replacement. */
function pick(pool, n, seen) {
  const items = pool.map((q) => ({ q, w: Math.max(0.2, weight(q, seen)) }));
  const out = [];
  while (out.length < n && items.length) {
    const total = items.reduce((s, i) => s + i.w, 0);
    let r = Math.random() * total;
    let idx = items.length - 1;
    for (let i = 0; i < items.length; i++) {
      r -= items[i].w;
      if (r <= 0) { idx = i; break; }
    }
    out.push(items[idx].q);
    items.splice(idx, 1);
  }
  return out;
}

/**
 * Binary answers are authored with the correct option first for readability.
 * Shuffling at runtime is what stops the user learning "always tap the left
 * button" instead of the medicine.
 */
function present(q) {
  if (q.type !== "binary") return q;
  const order = shuffle([0, 1]);
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    answer: order.indexOf(q.answer),
  };
}

/** Share of a round that should be tricky rather than plain recall. */
const TRICKY_SHARE = 0.4;

/**
 * Draw `count` items from a pool, balancing binary against fill-the-gap.
 * Alternating recognition and recall is what keeps a short session awake.
 */
function drawBalanced(pool, count, seen) {
  const binaries = pool.filter((q) => q.type === "binary");
  const gaps = pool.filter((q) => q.type === "gap");
  if (!binaries.length || !gaps.length) return pick(pool, Math.min(count, pool.length), seen);

  const wantGap = Math.min(gaps.length, Math.max(1, Math.round(count * 0.4)));
  const wantBin = Math.min(binaries.length, count - wantGap);
  let chosen = [...pick(gaps, wantGap, seen), ...pick(binaries, wantBin, seen)];

  if (chosen.length < count) {
    const rest = pool.filter((q) => !chosen.includes(q));
    chosen = [...chosen, ...pick(rest, count - chosen.length, seen)];
  }
  return chosen;
}

/**
 * Narrow a pool to the user's chosen format.
 *
 * Falls back to the full pool when the filter would empty it — a narrow topic
 * may hold no gap questions at all, and a short round beats no round.
 */
function byFormat(pool, qtype) {
  if (!qtype || qtype === "random") return pool;
  const wanted = pool.filter((q) => q.type === qtype);
  return wanted.length ? wanted : pool;
}

/**
 * Build a round: roughly 40% tricky, the rest plain recall.
 *
 * A narrow topic may hold no tricky questions at all, so whichever difficulty
 * runs short is topped up from the other. The user always gets a full round.
 */
export function build(rawPool, count, seen = {}, qtype = "random") {
  const pool = byFormat(rawPool, qtype);
  if (!pool.length) return [];

  const tricky = pool.filter((q) => q.difficulty === "tricky");
  const easy = pool.filter((q) => q.difficulty !== "tricky");

  let chosen;
  if (tricky.length && easy.length) {
    const wantTricky = Math.min(tricky.length, Math.round(count * TRICKY_SHARE));
    const wantEasy = Math.min(easy.length, count - wantTricky);
    chosen = [
      ...drawBalanced(tricky, wantTricky, seen),
      ...drawBalanced(easy, wantEasy, seen),
    ];
    if (chosen.length < count) {
      const rest = pool.filter((q) => !chosen.includes(q));
      chosen = [...chosen, ...pick(rest, count - chosen.length, seen)];
    }
  } else {
    chosen = drawBalanced(pool, count, seen);
  }

  return shuffle(chosen).map(present);
}

/** A random round draws from the whole bank. */
export function daily(count, seen = {}, qtype = "random") {
  return build(bank, count, seen, qtype);
}

/** Levenshtein, capped — we only care whether it is within 1 or 2. */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

function clean(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9+/\s-]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Grade a fill-the-gap answer. Typos are forgiven in proportion to word
 * length — this is a recall drill, not a spelling test — but short answers
 * like "B3" or "17" must match exactly, since one character is the whole answer.
 */
export function grade(question, input) {
  const given = clean(input);
  if (!given) return false;

  for (const variant of question.accept) {
    const target = clean(variant);
    if (given === target) return true;
    if (target.length >= 6) {
      const tolerance = target.length >= 10 ? 2 : 1;
      if (editDistance(given, target) <= tolerance) return true;
    }
  }
  return false;
}

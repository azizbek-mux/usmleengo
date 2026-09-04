// Anki's SM-2 scheduler.
//
// This follows Anki's own scheduler (SchedV2 / the Rust rewrite) rather than
// approximating it, because the whole value of Anki's timing is that it has
// been tuned against millions of reviews. The pieces that matter:
//
//   * Four grades, not three. Hard and Good are different answers: Hard says
//     "I got it, barely", and it lowers ease as well as shortening the step.
//   * A learning phase in MINUTES before a card ever gets a day-scale
//     interval. A new card is seen again in 1 minute, then 10, then graduates
//     to 1 day. Skipping this is the single biggest difference between a real
//     SRS and a box system.
//   * An ease factor per card, starting at 2.50, moved by -0.15 on Hard,
//     +0.15 on Easy, -0.20 on a lapse, floored at 1.30. Good does not change
//     it. The interval is the previous interval times this factor, so cards
//     you find hard genuinely come back more often, forever.
//   * Overdue credit: answering a card late counts the extra days as evidence
//     it stuck, and lengthens the next interval.
//   * Fuzz, so cards learned on the same day do not stay clumped together for
//     the rest of time.
//
// Intervals are computed with the ease the card had BEFORE the answer, and the
// ease is adjusted afterwards — the order Anki uses, and it changes results.

export const NEW = -1;
export const LEARNING = 0;
export const REVIEW = 1;
export const RELEARNING = 2;

export const GRADES = ["again", "hard", "good", "easy"];

// Anki's factory deck preset.
export const DEFAULTS = {
  newPerDay: 20,
  revPerDay: 200,
  learnSteps: [1, 10],        // minutes
  relearnSteps: [10],         // minutes
  graduatingInterval: 1,      // days, on Good out of learning
  easyInterval: 4,            // days, on Easy out of learning
  startingEase: 2.5,
  easyBonus: 1.3,
  hardInterval: 1.2,
  lapseMultiplier: 0,         // of the old interval, on a lapse
  intervalModifier: 1,
  minInterval: 1,
  maxInterval: 36500,
  minEase: 1.3,
  // Anki shows a learning card up to this many minutes early rather than
  // making you wait with nothing else to do.
  learnAheadMins: 20,
};

// Anki's day rolls over at 4am, so a 1am study session still counts as the
// previous day. Without this, anyone studying late loses a day of scheduling.
export const ROLLOVER_HOUR = 4;

export function dayNumber(atMs = Date.now()) {
  const d = new Date(atMs - ROLLOVER_HOUR * 3600000);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

export function minuteNumber(atMs = Date.now()) {
  return Math.floor(atMs / 60000);
}

export function freshCard() {
  return { state: NEW, step: 0, ease: DEFAULTS.startingEase, ivl: 0, due: 0, lapses: 0, reps: 0 };
}

/**
 * `due` is in day numbers for review cards and epoch minutes for everything
 * else — a review card is only ever due on a date, and a learning card needs
 * minute resolution. Always ask through here rather than comparing directly.
 */
export function isDue(card, today, nowMin) {
  if (card.state === NEW) return true;
  if (card.state === REVIEW) return card.due <= today;
  return card.due <= nowMin;
}

export function dueInMinutes(card, today, nowMin) {
  if (card.state === NEW) return 0;
  if (card.state === REVIEW) return (card.due - today) * 1440;
  return card.due - nowMin;
}

/* ── fuzz ──────────────────────────────────────────────────────────────────
   Seeded from the card and its review count so a preview and the answer that
   follows it always agree. Anki fuzzes with a live RNG and simply shows the
   result it rolled; deriving it instead means the number on the button is the
   number the card gets. */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fuzzFor(card, grade) {
  const g = GRADES.indexOf(grade) + 1;
  return mulberry32(Math.imul((card.key ?? 0) + 1, 2654435761) ^ ((card.reps + 1) * 31 + g));
}

function applyFuzz(ivl, rng) {
  if (ivl < 2.5) return Math.round(ivl);
  const pct = ivl < 7 ? 0.25 : ivl < 30 ? 0.15 : 0.05;
  const span = Math.max(1, Math.round(ivl * pct));
  return Math.max(1, Math.round(ivl) + (Math.floor(rng() * (2 * span + 1)) - span));
}

function constrained(ivl, prev, cfg, rng) {
  let v = ivl * cfg.intervalModifier;
  v = applyFuzz(v, rng);
  v = Math.max(v, prev + 1, 1);
  return Math.min(v, cfg.maxInterval);
}

const clampEase = (e, cfg) => Math.max(cfg.minEase, Math.round(e * 100) / 100);

/**
 * The three passing intervals for a review card, in Anki's order — each is
 * floored at one day beyond the one before it, which is what stops Hard, Good
 * and Easy from collapsing onto the same date.
 */
function reviewIntervals(card, cfg, today, rngFor) {
  const late = Math.max(0, today - card.due);
  const fct = card.ease;
  const hardMin = cfg.hardInterval > 1 ? card.ivl : 0;
  const hard = constrained(card.ivl * cfg.hardInterval, hardMin, cfg, rngFor("hard"));
  const good = constrained((card.ivl + late / 2) * fct, hard, cfg, rngFor("good"));
  const easy = constrained((card.ivl + late) * fct * cfg.easyBonus, good, cfg, rngFor("easy"));
  return { hard, good, easy };
}

/** Minutes to wait when repeating a learning step — Anki averages this step with the next. */
function repeatDelay(steps, step) {
  const cur = steps[Math.min(step, steps.length - 1)];
  const next = steps[step + 1];
  return Math.max(1, Math.round(next === undefined ? cur * 1.5 : (cur + next) / 2));
}

/**
 * Answer a card. Returns a new card — never mutates.
 *
 * `card.key` is the glossary index, used only to seed fuzz.
 */
export function answer(card, grade, opts = {}) {
  const cfg = { ...DEFAULTS, ...(opts.config || {}) };
  const nowMs = opts.now ?? Date.now();
  const today = dayNumber(nowMs);
  const nowMin = minuteNumber(nowMs);
  const rngFor = (g) => fuzzFor(card, g);

  const c = { ...card, reps: (card.reps || 0) + 1 };
  const wasReview = card.state === REVIEW;

  /* ── learning and relearning ── */
  if (!wasReview) {
    const relearn = card.state === RELEARNING;
    const steps = relearn ? cfg.relearnSteps : cfg.learnSteps;
    c.state = relearn ? RELEARNING : LEARNING;

    if (grade === "again") {
      c.step = 0;
      c.due = nowMin + steps[0];
      return c;
    }
    if (grade === "hard") {
      c.due = nowMin + repeatDelay(steps, c.step);
      return c;
    }
    if (grade === "good") {
      const next = c.step + 1;
      if (next < steps.length) {
        c.step = next;
        c.due = nowMin + steps[next];
        return c;
      }
      // Graduating out of relearning restores the interval set at the lapse.
      return graduate(c, relearn ? Math.max(cfg.minInterval, c.ivl) : cfg.graduatingInterval, today, cfg);
    }
    return graduate(c, relearn ? Math.max(cfg.minInterval, c.ivl + 1) : cfg.easyInterval, today, cfg);
  }

  /* ── review ── */
  if (grade === "again") {
    c.lapses = (card.lapses || 0) + 1;
    c.ivl = Math.max(cfg.minInterval, Math.round(card.ivl * cfg.lapseMultiplier));
    c.ease = clampEase(card.ease - 0.2, cfg);
    c.state = RELEARNING;
    c.step = 0;
    c.due = nowMin + cfg.relearnSteps[0];
    return c;
  }

  const ivls = reviewIntervals(card, cfg, today, rngFor);
  c.ivl = ivls[grade];
  // Ease moves after the interval is computed, on the old ease — Anki's order.
  if (grade === "hard") c.ease = clampEase(card.ease - 0.15, cfg);
  else if (grade === "easy") c.ease = clampEase(card.ease + 0.15, cfg);
  c.state = REVIEW;
  c.step = 0;
  c.due = today + c.ivl;
  return c;
}

function graduate(c, ivl, today, cfg) {
  c.state = REVIEW;
  c.step = 0;
  c.ivl = Math.min(cfg.maxInterval, Math.max(cfg.minInterval, Math.round(ivl)));
  c.due = today + c.ivl;
  return c;
}

/**
 * What each button will do, as minutes — for the labels Anki prints on them.
 * Runs the real scheduler rather than a parallel copy of the arithmetic, so
 * the two cannot drift apart.
 */
export function preview(card, opts = {}) {
  const nowMs = opts.now ?? Date.now();
  const today = dayNumber(nowMs);
  const nowMin = minuteNumber(nowMs);
  const out = {};
  for (const g of GRADES) {
    const next = answer(card, g, opts);
    out[g] = next.state === REVIEW ? next.ivl * 1440 : next.due - nowMin;
  }
  return out;
}

/** Anki's own compact unit labels: 10m, 1d, 2.3mo, 1.4y. */
export function formatInterval(minutes) {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) {
    const h = minutes / 60;
    return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h)}h`;
  }
  const days = minutes / 1440;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) {
    const mo = days / 30.417;
    return `${mo < 10 ? Math.round(mo * 10) / 10 : Math.round(mo)}mo`;
  }
  const y = days / 365;
  return `${y < 10 ? Math.round(y * 10) / 10 : Math.round(y)}y`;
}

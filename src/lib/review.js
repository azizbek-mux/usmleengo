// The Review part of the Quiz tab: what to study next, from the player's own
// answers.
//
//   Mistakes    — every question whose last answer was wrong. Answering it
//                 right takes it off; getting it wrong again puts it back.
//   Saved       — questions the player bookmarked.
//   Weak topics — accuracy in each category, weakest first.

/**
 * Is this seen-entry an open mistake?
 *
 * New entries record the last answer: [right, wrong, last], last 0 = wrong.
 * Entries from before that was kept have only the two counts, and all they
 * can say for certain is whether the question has ever been answered right.
 * So an old entry counts as a mistake only if it never has — never a
 * question the player may since have fixed.
 */
export function isMistake(entry) {
  if (!Array.isArray(entry)) return false;
  if (entry.length >= 3) return entry[2] === 0;
  return entry[0] === 0 && entry[1] > 0;
}

/** The questions still among the player's mistakes. */
export function mistakesIn(bank, seen = {}) {
  return bank.filter((q) => isMistake(seen[q.id]));
}

/** The saved questions still in the bank, newest first. */
export function savedIn(bank, saved = []) {
  const byId = new Map(bank.map((q) => [q.id, q]));
  return saved.map((id) => byId.get(id)).filter(Boolean);
}

/** Below this many answers a category's accuracy says more about luck than the player. */
export const MIN_ANSWERS = 5;

/**
 * Accuracy in each of `tags`, from every answer ever given to a question in
 * it: [{ tag, right, wrong, answered, pct }], weakest first. Categories with
 * too few answers to judge come last, marked by pct = null.
 */
export function topicAccuracy(bank, seen = {}, tags = []) {
  const wanted = new Set(tags);
  const totals = new Map(tags.map((t) => [t, { right: 0, wrong: 0 }]));
  for (const q of bank) {
    const entry = seen[q.id];
    if (!entry) continue;
    for (const t of q.tags) {
      if (!wanted.has(t)) continue;
      const tot = totals.get(t);
      tot.right += Number(entry[0]) || 0;
      tot.wrong += Number(entry[1]) || 0;
    }
  }
  const rows = tags.map((tag) => {
    const { right, wrong } = totals.get(tag);
    const answered = right + wrong;
    return { tag, right, wrong, answered, pct: answered >= MIN_ANSWERS ? Math.round((right / answered) * 100) : null };
  });
  const judged = rows.filter((r) => r.pct !== null).sort((a, b) => a.pct - b.pct || b.answered - a.answered);
  const unjudged = rows.filter((r) => r.pct === null);
  return [...judged, ...unjudged];
}

/**
 * How the player is doing in each system, or in each subject: one row per id
 * that has questions in the bank.
 *
 *   { id, total, seen, right, wrong, answered, pct }
 *
 * `seen` is how many of its questions they have answered at least once, out
 * of `total`; `pct` is the share of every answer given that was right, or
 * null while there are too few answers to judge. Weakest first, then the
 * ones not yet judged, most-seen first - the order the progress screen
 * reads in.
 *
 * `key` is "system" or "subject": the field the bank stamps on each question.
 */
export function progressBy(bank, seen = {}, key, ids = []) {
  const rows = new Map(ids.map((id) => [id, { id, total: 0, seen: 0, right: 0, wrong: 0 }]));
  for (const q of bank) {
    const row = rows.get(q[key]);
    if (!row) continue;
    row.total += 1;
    const entry = seen[q.id];
    const right = Number(entry?.[0]) || 0;
    const wrong = Number(entry?.[1]) || 0;
    if (!right && !wrong) continue;
    row.seen += 1;
    row.right += right;
    row.wrong += wrong;
  }
  const done = [...rows.values()].filter((r) => r.total > 0).map((r) => {
    const answered = r.right + r.wrong;
    return { ...r, answered, pct: answered >= MIN_ANSWERS ? Math.round((r.right / answered) * 100) : null };
  });
  const judged = done.filter((r) => r.pct !== null).sort((a, b) => a.pct - b.pct || b.answered - a.answered);
  const rest = done.filter((r) => r.pct === null).sort((a, b) => b.seen - a.seen);
  return [...judged, ...rest];
}

/**
 * Right and wrong answers in each system, as [right, wrong] by id, for the
 * teacher of a class the player has joined. Only systems with answers.
 */
export function systemTotals(bank, seen = {}, ids = []) {
  const out = {};
  for (const r of progressBy(bank, seen, "system", ids)) if (r.answered) out[r.id] = [r.right, r.wrong];
  return out;
}

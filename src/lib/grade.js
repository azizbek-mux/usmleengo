// Grading a typed answer.
//
// Kept apart from session.js, which reads the question bank, so the game
// server can grade with exactly the rule the app uses without pulling the
// bank in with it.

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

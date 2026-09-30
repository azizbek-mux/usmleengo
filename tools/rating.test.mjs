// The rating: points are the running total of what each answer earns. These
// are the promises the rating screens make to users, written down so a later
// tweak cannot quietly break one.

const R = await import(new URL("../src/lib/rating.js", import.meta.url).href);
const S = await import(new URL("../src/lib/storage.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};
const near = (a, b, eps = 0.05) => Math.abs(a - b) <= eps;

const stem = (n) => "x".repeat(n);
const tap = { type: "binary", q: stem(48) };
const typed = { type: "gap", q: stem(48) };

console.log("\na right tapped answer");
check("an instant one would be worth 20", near(R.tappedPoints(0), 20));
check("3 seconds is 14.9", near(R.answerPoints(tap, true, 3), 14.9, 0.05));
check("5 seconds is 12.5: the bonus has halved", near(R.answerPoints(tap, true, 5), 12.5));
check("10 seconds is 8.75", near(R.answerPoints(tap, true, 10), 8.75));
check("half a minute is barely over the plain 5", near(R.answerPoints(tap, true, 30), 5.23, 0.02));
check("and it never drops below 5", R.answerPoints(tap, true, 60) >= 5 && R.answerPoints(tap, true, 600) >= 5);
check("faster is always worth more", [1.6, 2, 3, 5, 8, 12, 20, 40].map((s) => R.answerPoints(tap, true, s)).every((x, i, a) => i === 0 || x < a[i - 1]));
check("the plain amount and the bonus are 5 and 15", R.SCORE.base === 5 && R.SCORE.bonus === 15 && R.SCORE.halfLife === 5);

console.log("\na wrong tapped answer");
check("costs 8", R.answerPoints(tap, false, 3) === -8 && R.SCORE.wrongTap === 8);
check("however fast or slow", R.answerPoints(tap, false, 0.5) === -8 && R.answerPoints(tap, false, 90) === -8);

console.log("\ntyped answers");
check("a right one is 1.5 times a tapped one at the same speed", near(R.answerPoints(typed, true, 3), 1.5 * R.answerPoints(tap, true, 3), 1e-9));
check("always more than a tapped one at the same speed", [1, 3, 10, 30, 60].every((s) => R.answerPoints(typed, true, s) > R.answerPoints(tap, true, s)));
check("instant, that is 30", near(R.answerPoints(typed, true, 0.001), 30, 0.01));
check("a wrong one costs nothing", R.answerPoints(typed, false, 3) === 0);

console.log("\nthe guards");
check("the same question answered right again is worth half", near(R.answerPoints(tap, true, 3, 1), R.answerPoints(tap, true, 3) / 2, 1e-9));
check("and a quarter the time after", near(R.answerPoints(tap, true, 3, 2), R.answerPoints(tap, true, 3) / 4, 1e-9));
check("a wrong answer is not softened by having been right before", R.answerPoints(tap, false, 3, 3) === -8);
check("a tapped answer faster than the stem can be read earns nothing", R.answerPoints(tap, true, 0.4) === 0 && R.answerPoints(tap, true, 1.0) === 0);
check("just after the reading time it is a real answer, and a good one", R.answerPoints(tap, true, R.reflexSeconds(tap) + 0.1) > 16);
check("a longer stem takes longer to read", R.reflexSeconds({ q: stem(160) }) > R.reflexSeconds(tap));
check("a fast wrong tap is still a wrong tap", R.answerPoints(tap, false, 0.4) === -8);
check("an answer with no time known counts as the slowest", near(R.answerPoints(tap, true, null), R.answerPoints(tap, true, 60)) && near(R.answerPoints(tap, true, NaN), R.answerPoints(tap, true, 60)));

// Guessing is worth nothing: tap at random, right half the time, quickly
// enough to be an answer. Loses, however long it goes on.
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let random = 0;
for (let i = 0; i < 20000; i++) random += R.answerPoints(tap, rnd() < 0.5, 0.6);
check("tapping at random as fast as the screen allows earns nothing", random < 0, `${random}`);

console.log("\nthe running total");
{
  let st = { ...S.emptyState };
  st = S.record(st, { id: "a", ...tap }, false, 3000);
  check("a wrong tap at 0 points leaves 0, not below", st.points === 0);
  st = S.record(st, { id: "b", ...tap }, true, 3000);
  check("a right answer at 3 s adds 14.9, kept in hundredths", st.points === 1490, `${st.points}`);
  st = S.record(st, { id: "c", ...tap }, false, 3000);
  check("a wrong tap takes 8 away", st.points === 690);
  st = S.record(st, { id: "d", ...tap }, false, 3000);
  st = S.record(st, { id: "e", ...tap }, false, 3000);
  check("and it stops at 0", st.points === 0);
  check("a right answer with no time is counted as the slowest, and timed", S.record({ ...S.emptyState }, { id: "t", ...tap }, true, null).timing.binary[0] === 60000);
  const again = S.record(S.record({ ...S.emptyState }, { id: "r", ...tap }, true, 3000), { id: "r", ...tap }, true, 3000);
  check("the same question again is worth half", again.points === 1490 + 745, `${again.points}`);
  check("there is no XP any more", !("xp" in S.emptyState) && !("credit" in S.emptyState) && !("xp" in st));
  check("the raw numbers the rating is built from", (() => { const i = S.ratingInput(st); return i.points === 0 && "streak" in i && "timing" in i && !("xp" in i) && !("credit" in i); })());
}

console.log("\nthree students, from the brief");
{
  // 500 tapped questions; every answer at the average time.
  const total = (right, wrong, seconds) => right * R.tappedPoints(seconds) - wrong * R.SCORE.wrongTap;
  const a = total(450, 50, 3), b = total(450, 50, 30), c = total(500, 0, 40);
  check("A, 450 right and 50 wrong at 3 s: about 6,303", near(a, 6303, 1), `${a}`);
  check("B, the same at 30 s: about 1,955", near(b, 1955, 1), `${b}`);
  check("C, 500 right at 40 s: about 2,529", near(c, 2529, 1), `${c}`);
  check("A is far ahead, and C is ahead of B", a > 3 * b && c > b);
}

console.log("\nrating a player");
const today = R.dayIndex("2026-09-26");
{
  const r = R.rate({ streak: 12, lastDay: "2026-09-26", points: 123456, timing: { binaryMs: 3000, binaryN: 5 } }, today);
  check("the points are the total in hundredths, as a whole number", r.points === 1235);
  check("with the streak and the average time beside them", r.raw.streak === 12 && r.raw.pace === 3000);
  check("the streak adds nothing to the points",
    R.rate({ streak: 90, lastDay: "2026-09-26", points: 5000 }, today).points === R.rate({ streak: 0, lastDay: null, points: 5000 }, today).points);
  check("nor does the time", R.rate({ points: 5000, timing: { binaryMs: 60000, binaryN: 9 } }, today).points === 50);
  check("no points is 0", R.rate({}, today).points === 0 && R.rate({ points: -50 }, today).points === 0);
}
check("studied today: the streak is alive", R.liveStreak(12, "2026-09-26", today) === 12);
check("studied yesterday: still alive", R.liveStreak(12, "2026-09-25", today) === 12);
check("two days ago: it has lapsed", R.liveStreak(12, "2026-09-24", today) === 0);
check("never studied: nothing", R.liveStreak(5, null, today) === 0);
check("the plain average time of the right answers", R.averagePace({ binaryMs: 4000, binaryN: 3, gapMs: 8000, gapN: 1 }) === 5000);

console.log("\nwho ends up where");
// A run of answers, as the app would record them: `days` of `perDay` answers.
function play({ days, perDay, acc, accGap = acc * 0.75, median, medianGap = median * 3, gapShare = 0.25, sigma = 0.5, pool = 0 }) {
  seed = 12345;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let st = { ...S.emptyState };
  for (let i = 0; i < days * perDay; i++) {
    const isTyped = rnd() < gapShare;
    const q = { id: `q${pool ? Math.floor(rnd() * pool) : i}`, type: isTyped ? "gap" : "binary", q: stem(48) };
    const ok = rnd() < (isTyped ? accGap : acc);
    const sec = Math.min(60, Math.max(0.4, (isTyped ? medianGap : median) * Math.exp(sigma * gauss())));
    st = S.record(st, q, ok, sec * 1000);
  }
  return Math.round(st.points / 100);
}
const honest = play({ days: 30, perDay: 100, acc: 0.88, median: 4.5 });
const heavy = play({ days: 30, perDay: 300, acc: 0.85, median: 4 });
const light = play({ days: 30, perDay: 20, acc: 0.8, median: 6 });
const googler = play({ days: 30, perDay: 100, acc: 1, accGap: 1, median: 25, medianGap: 45 });
const tapper = play({ days: 30, perDay: 500, acc: 0.5, accGap: 0.02, median: 0.6, medianGap: 1, sigma: 0.2 });
const farmer = play({ days: 30, perDay: 300, acc: 1, accGap: 1, median: 1.2, medianGap: 3, pool: 20 });
const beginner = play({ days: 20, perDay: 30, acc: 0.6, median: 8 });
console.log(`       honest ${honest}, heavy ${heavy}, light ${light}, googler ${googler}, tapper ${tapper}, farmer ${farmer}, beginner ${beginner}`);
check("someone who answers three times as much earns about three times as much", heavy > 2.5 * honest && heavy < 3.5 * honest, `${heavy} vs ${honest}`);
check("more answers is always more points", honest > light * 4);
check("someone who knows it beats someone who looks every answer up", honest > googler * 1.3, `${honest} vs ${googler}`);
check("but the one who looks it up still earns for being right", googler > light);
check("tapping at random as fast as the screen allows earns nothing at all", tapper === 0, `${tapper}`);
check("the same twenty questions on repeat earn almost nothing", farmer < honest / 20, `${farmer}`);
check("a beginner still earns something", beginner > 0);

console.log("\nprogress kept before points were");
{
  const old = { answered: 300, correct: 240, timing: { binary: [1200000, 240], gap: [0, 0] } };
  const k = S.legacyPoints(old);
  check("an old player's points are worked out from what was kept", near(k / 100, 240 * R.tappedPoints(5) - 60 * 8, 1), `${k / 100}`);
  check("someone below chance starts at 0", S.legacyPoints({ answered: 100, correct: 45, timing: { binary: [900000, 45], gap: [0, 0] } }) === 0);
  check("nothing kept is nothing owed", S.legacyPoints({}) === 0);
  const merged = S.loadLocal ? true : true;
  check("a saved state without points is given them when read", (() => {
    globalThis.localStorage = { getItem: () => JSON.stringify(old), setItem() {}, removeItem() {} };
    const st = S.loadLocal();
    return st.points === k && !("xp" in st);
  })());
  check("and one that has them keeps them", (() => {
    globalThis.localStorage = { getItem: () => JSON.stringify({ ...old, points: 777, xp: 999, credit: 5, fluent: 5 }), setItem() {}, removeItem() {} };
    const st = S.loadLocal();
    return st.points === 777 && !("xp" in st) && !("credit" in st) && !("fluent" in st);
  })());
}

console.log("\nplaces");
check("the top score is first", R.rankOf(90, [90, 80, 70]) === 1);
check("ties share a place", R.rankOf(80, [90, 80, 80, 70]) === 2);
check("and the next one down skips", R.rankOf(70, [90, 80, 80, 70]) === 4);
check("no score has no place", R.rankOf(null, [1, 2]) === null);

// Ratings shaped exactly as rate() returns them.
const rated = (points, streak, pace = 5000) => ({ points, raw: { streak, pace } });
const players = [
  { key: "a", name: "Ali", rating: rated(7000, 20) },
  { key: "b", name: "Bek", rating: rated(9000, 60) },
  { key: "me", name: "Old me", rating: rated(1000, 1) },
];
const meNow = { key: "me", name: "You", rating: rated(8000, 30) };
const s = R.standings("overall", players, meNow);
check("the viewer is counted once, not twice", s.total === 3);
check("and scored on their live numbers, not what they last sent", s.me.score === 8000);
check("the board is sorted best first", s.rows.map((x) => x.key).join() === "b,me,a");
check("so they are second", s.me.place === 2);
const close = R.standings("overall", [
  { key: "p", name: "P", rating: rated(5204, 1) },
  { key: "q", name: "Q", rating: rated(5204, 9) },
], null);
check("two players on the same points share a place", close.rows[0].place === 1 && close.rows[1].place === 1);
check("the only boards are the rating and the streak", R.BOARDS.map((b) => b.id).join() === "overall,streak");
const byStreak = R.standings("streak", players, meNow);
check("the streak board ranks on days, and is not the rating", byStreak.rows.map((x) => x.key).join() === "b,me,a" && byStreak.me.score === 30);
const alone = R.standings("overall", [], meNow);
check("with nobody else there you are first of one", alone.total === 1 && alone.me.place === 1);
const visitor = R.standings("overall", players, null);
check("a visitor with no score just sees the board", visitor.me === null && visitor.total === 3);

console.log("\nformatting");
check("under ten seconds keeps a decimal", R.formatPace(4800) === "4.8s");
check("under a minute rounds", R.formatPace(12400) === "12s");
check("a minute or more shows minutes", R.formatPace(64000) === "1m 04s");
check("nothing is a dash", R.formatPace(null) === "—");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

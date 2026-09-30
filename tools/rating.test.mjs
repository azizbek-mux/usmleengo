// The rating algorithm: what each answer earns, how the three scores behave,
// and how they mix. These are the promises the rating screen makes to users,
// written down so a later tweak cannot quietly break one - above all the
// fairness ones: knowing beats guessing, looking things up and grinding.

const R = await import(new URL("../src/lib/rating.js", import.meta.url).href);
const S = await import(new URL("../src/lib/storage.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

const stem = (n) => "x".repeat(n);
const tap = { type: "binary", q: stem(48) };
const gap = { type: "gap", q: stem(48) };
const picture = { type: "binary", img: "x.webp", q: "" };

console.log("\ntime: how quick a right answer was");
check("inside the free time it is worth all of it", R.timeCredit(tap, 3) === 1 && R.timeCredit(tap, R.TIME.binary.free + 0.01) > 0.99);
check("slower is worth less", R.timeCredit(tap, 8) < R.timeCredit(tap, 6) && R.timeCredit(tap, 20) < R.timeCredit(tap, 8));
check("a look-up (30 s) is worth very little", R.timeCredit(tap, 30) < 0.2);
check("but never nothing: a slow right answer is still right", R.timeCredit(tap, 60) === R.TIME.floor && R.TIME.floor > 0);
check("a reflex tap - faster than the stem can be read - is worth nothing", R.timeCredit(tap, 0.5) === 0);
check("a longer stem needs longer to read", R.reflexSeconds({ q: stem(160) }) > R.reflexSeconds({ q: stem(40) }));
check("just over the reading time is a real answer", R.timeCredit(tap, R.reflexSeconds(tap) + 0.3) === 1);
check("typing gets more room than tapping", R.timeCredit(gap, 10) > R.timeCredit(tap, 10) && R.TIME.gap.free > R.TIME.binary.free);
check("a picture gets its viewing time back", R.timeCredit({ ...picture }, 8) > R.timeCredit({ type: "binary", q: "" }, 8));
check("and a long stem its reading time", R.timeCredit({ type: "binary", q: stem(200) }, 8) > R.timeCredit(tap, 8));
check("an answer with no time known counts as the slowest", R.timeCredit(tap, null) === R.TIME.floor && R.timeCredit(tap, NaN) === R.TIME.floor);

console.log("\nXP: what an answer earns");
check("a quick right tap is 10", R.xpFor(tap, true, 3) === 10);
check("a quick right typed answer is 15", R.xpFor(gap, true, 8) === 15);
check("a picture question is tapped, so it pays as tapped", R.xpFor(picture, true, 3) === 10);
check("a wrong answer still earns something", R.xpFor(gap, false, 3) === 2 && R.xpFor(tap, false, 3) === 2);
check("a slow right answer earns a share, not all", R.xpFor(tap, true, 40) > R.xpFor(tap, false, 40) && R.xpFor(tap, true, 40) < 6);
check("so a look-up earns much less than knowing", R.xpFor(tap, true, 40) < R.xpFor(tap, true, 3) / 2);
check("a right answer is never worth less than a wrong one", R.xpFor(tap, true, 60) > R.xpFor(tap, false, 60));
check("slower never pays more", [2, 4, 6, 9, 14, 25, 60].map((s) => R.xpFor(tap, true, s)).every((x, i, a) => i === 0 || x <= a[i - 1]));

console.log("\ncredit: what an answer proves");
check("a quick right tap adds one", R.knowledgeFor(tap, true, 3).credit === 1);
check("a wrong tap takes one away: exactly what a guess is worth", R.knowledgeFor(tap, false, 3).credit === -1);
check("a right typed answer adds one and a half", R.knowledgeFor(gap, true, 8).credit === 1.5);
check("a wrong typed answer costs nothing: it cannot be guessed", R.knowledgeFor(gap, false, 8).credit === 0);
check("a reflex tap that happens to be right adds nothing", R.knowledgeFor(tap, true, 0.4).credit === 0);
check("a slow right answer adds less", R.knowledgeFor(tap, true, 30).credit < 0.2);
check("the same question answered right again is worth half", R.knowledgeFor(tap, true, 3, 1).credit === 0.5);
check("and a quarter the time after", R.knowledgeFor(tap, true, 3, 2).credit === 0.25);
check("a question got wrong before still counts in full when finally got right", R.knowledgeFor(tap, true, 3, 0).credit === 1);
check("the time credit of a right answer is kept for the average", R.knowledgeFor(tap, true, 3).fluent === 1 && R.knowledgeFor(tap, false, 3).fluent === 0);

// Guessing is worth nothing: tap at a comfortable pace, right half the time.
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
let guess = 0;
for (let i = 0; i < 20000; i++) guess += R.knowledgeFor(tap, rnd() < 0.5, 3).credit;
check("guessing at random earns nothing, however long it goes on", Math.abs(guess / 20000) < 0.02, `${(guess / 20000).toFixed(3)} a guess`);
let fast = 0;
for (let i = 0; i < 20000; i++) fast += R.knowledgeFor(tap, rnd() < 0.5, 0.5).credit;
check("and tapping at random as fast as the screen allows loses", fast / 20000 < -0.4, `${(fast / 20000).toFixed(3)} a tap`);
let sure = 0;
for (let i = 0; i < 1000; i++) sure += R.knowledgeFor(tap, rnd() < 0.85, 3).credit;
check("knowing 85% of them quickly earns about 0.7 an answer", near(sure / 1000, 0.7, 0.06), `${(sure / 1000).toFixed(2)}`);

console.log("\nstreak");
check("no streak scores 0", R.streakScore(0) === 0);
check("a month is most of the way there (~63)", near(R.streakScore(30), 63.2));
check("more days always scores more", R.streakScore(61) > R.streakScore(60));
check("but never passes 100", R.streakScore(10000) <= 100);
const today = R.dayIndex("2026-09-26");
check("studied today: the streak counts", R.liveStreak(12, "2026-09-26", today) === 12);
check("studied yesterday: still alive", R.liveStreak(12, "2026-09-25", today) === 12);
check("two days ago: it has lapsed", R.liveStreak(12, "2026-09-24", today) === 0);
check("never studied: nothing", R.liveStreak(5, null, today) === 0);

console.log("\nmastery");
check("no credit scores 0", R.masteryScore(0) === 0);
check("credit below zero scores 0, not less", R.masteryScore(-5000) === 0);
check("1,200 net credit is ~63", near(R.masteryScore(120000), 63.2));
check("more credit always scores more", R.masteryScore(120100) > R.masteryScore(120000));
check("never passes 100", R.masteryScore(1e12) <= 100);

console.log("\nspeed");
const timed = (n) => ({ binaryMs: 3000, binaryN: n, gapMs: 0, gapN: 0 });
check("nothing timed scores 0", R.speedScore({}) === 0);
check("a few quick answers prove nothing: one is worth almost nothing", R.speedScore({ credit: 100, fluent: 100, timing: timed(1) }) < 1);
check("evidence builds with net credit", R.speedScore({ credit: 20000, fluent: 20000, timing: timed(200) }) > R.speedScore({ credit: 5000, fluent: 5000, timing: timed(50) }));
check("and is nearly all there by 800", R.speedScore({ credit: 80000, fluent: 90000, timing: timed(900) }) > 80);
check("all right answers as quick as knowing them: full marks with the evidence", R.speedScore({ credit: 500000, fluent: 100000, timing: timed(1000) }) > 99);
check("all as slow as looking them up: nothing", R.speedScore({ credit: 500000, fluent: 15000, timing: timed(1000) }) === 0);
check("slower scores lower", R.speedScore({ credit: 100000, fluent: 60000, timing: timed(1000) }) < R.speedScore({ credit: 100000, fluent: 90000, timing: timed(1000) }));
check("speed with no credit behind it is worth nothing: tapping at random is not fast, it is empty",
  R.speedScore({ credit: 0, fluent: 100000, timing: timed(1000) }) === 0 && R.speedScore({ credit: -3000, fluent: 100000, timing: timed(1000) }) === 0);
check("the displayed average is a plain average over everything timed",
  R.averagePace({ binaryMs: 4000, binaryN: 3, gapMs: 8000, gapN: 1 }) === 5000);

console.log("\nthe mix");
check("streak weighs most, then answers, then speed",
  R.WEIGHTS.streak > R.WEIGHTS.mastery && R.WEIGHTS.mastery > R.WEIGHTS.speed);
check("the weights add up to one", near(R.WEIGHTS.streak + R.WEIGHTS.mastery + R.WEIGHTS.speed, 1, 1e-9));
check("the same lead is worth more in streak than in answers",
  R.overallScore({ streak: 80, mastery: 20, speed: 50 }) > R.overallScore({ streak: 20, mastery: 80, speed: 50 }));
check("and more in answers than in speed",
  R.overallScore({ streak: 50, mastery: 80, speed: 20 }) > R.overallScore({ streak: 50, mastery: 20, speed: 80 }));
check("everything at 100 is 100", near(R.overallScore({ streak: 100, mastery: 100, speed: 100 }), 100, 1e-9));
check("a streak on its own can never pass half the points", R.overallScore({ streak: 100, mastery: 0, speed: 0 }) === 50);

console.log("\nrating a player");
const r = R.rate({ streak: 30, lastDay: "2026-09-26", xp: 6000, credit: 120000, fluent: 90000, timing: { binaryMs: 3000, binaryN: 1000 } }, today);
check("the three parts come back", near(r.streak, 63.2) && near(r.mastery, 63.2) && r.speed > 50);
check("with the raw numbers alongside", r.raw.streak === 30 && r.raw.xp === 6000 && r.raw.pace === 3000 && r.raw.credit === 1200);
const lapsed = R.rate({ streak: 30, lastDay: "2026-09-01", xp: 6000 }, today);
check("a lapsed streak scores as no streak", lapsed.streak === 0 && lapsed.raw.streak === 0);
check("a player with no credit yet is rated on the streak alone", R.rate({ streak: 30, lastDay: "2026-09-26" }, today).overall === R.streakScore(30) * 0.5);

console.log("\nfairness: who ranks above whom");
// A run of answers, as the app would record them.
function play({ days, answers, acc, accGap = acc * 0.75, median, medianGap = median * 3, gapShare = 0.25, sigma = 0.5, pool = 0 }) {
  seed = 12345;
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let st = { ...S.emptyState, streak: days, lastDay: "2026-09-26" };
  for (let i = 0; i < answers; i++) {
    const typed = rnd() < gapShare;
    const q = { id: `q${pool ? Math.floor(rnd() * pool) : i}`, type: typed ? "gap" : "binary", q: stem(48) };
    const ok = rnd() < (typed ? accGap : acc);
    const sec = Math.min(60, Math.max(0.4, (typed ? medianGap : median) * Math.exp(sigma * gauss())));
    st = S.record(st, q, ok, sec * 1000);
  }
  const rating = R.rate(S.ratingInput(st), today);
  return { st, rating, pts: R.points(rating.overall) };
}
const honest = play({ days: 30, answers: 1800, acc: 0.88, median: 4.5 });
const googler = play({ days: 30, answers: 3000, acc: 1, accGap: 1, median: 25, medianGap: 45 });
const tapper = play({ days: 30, answers: 9000, acc: 0.5, accGap: 0.02, median: 0.6, medianGap: 1, sigma: 0.2 });
const attend = play({ days: 90, answers: 180, acc: 0.75, median: 8 });
const farmer = play({ days: 30, answers: 9000, acc: 1, accGap: 1, median: 1.2, medianGap: 3, pool: 20 });
const newcomer = play({ days: 1, answers: 1, acc: 1, median: 1.5, gapShare: 0 });
const beginner = play({ days: 10, answers: 200, acc: 0.6, median: 8 });
const decent = play({ days: 14, answers: 560, acc: 0.82, median: 5.5 });
console.log(`       honest ${honest.pts}, googler ${googler.pts}, tapper ${tapper.pts}, attendance ${attend.pts}, farmer ${farmer.pts}, newcomer ${newcomer.pts}, beginner ${beginner.pts}, decent ${decent.pts}`);
check("someone who knows it beats someone who looks it up, though the other answered more", honest.pts > googler.pts + 100);
check("the one who looks everything up still earns something for being right", googler.rating.mastery > 0 && googler.pts > tapper.pts);
check("tapping at random earns exactly what turning up earns: the streak, and no more",
  tapper.rating.mastery === 0 && tapper.rating.speed === 0 && Math.abs(tapper.rating.overall - R.streakScore(30) * 0.5) < 1e-9);
check("a lucky quick tap on day one is nothing", newcomer.pts < 30, `${newcomer.pts}`);
check("repeating the same twenty questions all month earns almost nothing", farmer.rating.mastery < honest.rating.mastery / 10, `${farmer.rating.mastery.toFixed(1)} vs ${honest.rating.mastery.toFixed(1)}`);
check("ninety days of two answers a day is discipline, and is paid as it: above a fortnight of good work",
  attend.pts > decent.pts);
check("but not above a month of real work", attend.pts < honest.pts);
check("a streak alone stays under half of the points", attend.pts <= 500 + 60);
check("a beginner at 60% earns from the streak but next to nothing for answers", beginner.rating.mastery < 2);
check("a serious month scores well", honest.pts > 550 && honest.pts < 800, `${honest.pts}`);
check("XP from looking things up is far below XP from knowing them, per answer",
  googler.st.xp / 3000 < honest.st.xp / 1800 * 0.75, `${(googler.st.xp / 3000).toFixed(2)} vs ${(honest.st.xp / 1800).toFixed(2)}`);

console.log("\nprogress kept before credit was");
{
  const old = { answered: 300, correct: 240, timing: { binary: [1200000, 240], gap: [0, 0] } };
  const k = S.legacyKnowledge(old);
  check("an old player's credit is worked out from what was kept", k.credit > 0 && k.fluent > 0, JSON.stringify(k));
  check("about right: 240 right at 5 s each (worth 0.88) and 60 wrong is 240 x 0.88 - 60", near(k.credit / 100, 240 * 0.88 - 60, 3), `${k.credit / 100}`);
  const bad = S.legacyKnowledge({ answered: 100, correct: 45, timing: { binary: [900000, 45], gap: [0, 0] } });
  check("someone below chance starts below zero, and the rating reads that as no credit", bad.credit < 0 && R.masteryScore(bad.credit) === 0);
  check("nothing kept is nothing owed", S.legacyKnowledge({}).credit === 0 && S.legacyKnowledge({}).fluent === 0);
  const rec = S.record({ ...S.emptyState }, tap, true, 3000);
  check("recording an answer moves credit and fluency by what knowledgeFor says", rec.credit === 100 && rec.fluent === 100);
  check("and XP, and the timing", rec.xp === 10 && rec.timing.binary[1] === 1);
  check("a right answer with no time is counted as the slowest", S.record({ ...S.emptyState }, tap, true, null).timing.binary[0] === 60000);
  const again = S.record(rec, tap, true, 3000);
  check("the same question again is half", again.credit - rec.credit === 50);
}

console.log("\nplaces");
check("the top score is first", R.rankOf(90, [90, 80, 70]) === 1);
check("ties share a place", R.rankOf(80, [90, 80, 80, 70]) === 2);
check("and the next one down skips", R.rankOf(70, [90, 80, 80, 70]) === 4);
check("no score has no place", R.rankOf(null, [1, 2]) === null);

// Ratings shaped exactly as rate() returns them.
const rated = (overall, streak, xp, pace, credit = 500) => ({ overall, raw: { streak, xp, pace, credit } });
const players = [
  { key: "a", name: "Ali", rating: rated(70, 20, 9000, 6000) },
  { key: "b", name: "Bek", rating: rated(90, 60, 5000, 4000) },
  { key: "me", name: "Old me", rating: rated(10, 1, 100, 9000) },
];
const meNow = { key: "me", name: "You", rating: rated(80, 30, 7000, 5000) };
const s = R.standings("overall", players, meNow);
check("the viewer is counted once, not twice", s.total === 3);
check("and scored on their live numbers, not what they last sent", s.me.score === 800);
check("points are the overall rating out of 1000", R.points(52.04) === 520 && R.points(100) === R.POINTS_MAX);
const close = R.standings("overall", [
  { key: "p", name: "P", rating: { overall: 52.04, raw: {} } },
  { key: "q", name: "Q", rating: { overall: 52.01, raw: {} } },
], null);
check("two players showing the same points share a place",
  close.rows[0].place === 1 && close.rows[1].place === 1, JSON.stringify(close.rows.map((r) => [r.score, r.place])));
check("so they are second", s.me.place === 2);
check("the board is sorted best first", s.rows.map((x) => x.key).join() === "b,me,a");
const byXp = R.standings("xp", players, meNow);
check("each board ranks on its own number", byXp.rows[0].key === "a" && byXp.me.place === 2);
const byStreak = R.standings("streak", players, meNow);
check("the streak board ranks on days", byStreak.rows.map((x) => x.key).join() === "b,me,a");
const bySpeed = R.standings("speed", players, meNow);
check("the speed board puts the fastest first", bySpeed.rows.map((x) => x.key).join() === "b,me,a");
check("nobody is on the speed board on time alone: the answers behind it must have been right",
  R.standings("speed", [{ key: "t", name: "T", rating: rated(50, 1, 90, 500, 20) }], null).total === 0);
check("with enough credit they are", R.standings("speed", [{ key: "t", name: "T", rating: rated(50, 1, 90, 900, R.SPEED_BOARD_MIN) }], null).total === 1);
check("so a tapper at 0.5 s does not top the stopwatch", (() => {
  const board = R.standings("speed", [...players, { key: "tap", name: "Tapper", rating: rated(30, 1, 90, 500, 0) }], meNow);
  return !board.rows.some((row) => row.key === "tap");
})());

// The bug this guards against: the speed board once sorted on a different
// number from the one it showed, and printed a 5.5s player below a 7.2s one.
// Every board must read in order of the number it shows.
const mixedField = [
  { key: "typist", name: "T", rating: R.rate({ streak: 5, lastDay: today, xp: 900, credit: 30000, fluent: 25000, timing: { binaryMs: 3900, binaryN: 40, gapMs: 8200, gapN: 60 } }, today) },
  { key: "tapper", name: "P", rating: R.rate({ streak: 5, lastDay: today, xp: 900, credit: 30000, fluent: 25000, timing: { binaryMs: 5500, binaryN: 100 } }, today) },
  { key: "slow", name: "S", rating: R.rate({ streak: 5, lastDay: today, xp: 900, credit: 30000, fluent: 25000, timing: { binaryMs: 7200, binaryN: 100 } }, today) },
];
const shown = R.standings("speed", mixedField, null).rows.map((r) => r.rating.raw.pace);
check("the speed board reads fastest to slowest, whatever the mix of types",
  shown.length === 3 && shown.every((p, i) => i === 0 || p >= shown[i - 1]), JSON.stringify(shown));
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

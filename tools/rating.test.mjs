// The rating algorithm: what each answer earns, how the three scores behave,
// and how they mix. These are the promises the rating screen makes to users,
// written down so a later tweak cannot quietly break one.

const R = await import(new URL("../src/lib/rating.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

console.log("\nwhat an answer earns");
const gap = { type: "gap" }, binary = { type: "binary" }, picture = { type: "binary", img: "x.webp" };
check("a typed correct answer earns more than a tapped one", R.xpFor(gap, true) > R.xpFor(binary, true));
check("typed correct is 15", R.xpFor(gap, true) === 15);
check("tapped correct is 10", R.xpFor(binary, true) === 10);
check("a picture question is tapped, so it pays as tapped", R.xpFor(picture, true) === 10);
check("a wrong answer still earns something", R.xpFor(gap, false) === 2 && R.xpFor(binary, false) === 2);
check("but never as much as a right one", R.xpFor(binary, false) < R.xpFor(binary, true));

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

console.log("\nxp");
check("no XP scores 0", R.xpScore(0) === 0);
check("6,000 XP is ~63", near(R.xpScore(6000), 63.2));
check("more XP always scores more", R.xpScore(6001) > R.xpScore(6000));
check("never passes 100", R.xpScore(1e9) <= 100);

console.log("\nspeed");
check("nothing timed has no speed score, not a zero", R.speedScore({}) === null);
check("a tapper inside four seconds scores full marks",
  R.speedScore({ binaryMs: 3500, binaryN: 20 }) === 100);
check("slower scores lower", R.speedScore({ binaryMs: 9000, binaryN: 20 }) < R.speedScore({ binaryMs: 6000, binaryN: 20 }));
check("even a minute per answer is not zero", R.speedScore({ binaryMs: 60000, binaryN: 20 }) > 0);
check("typing gets a longer allowance: 9s typed is still full marks",
  R.speedScore({ gapMs: 9000, gapN: 20 }) === 100);
check("so a fast typist and a fast tapper tie",
  R.speedScore({ gapMs: 9000, gapN: 20 }) === R.speedScore({ binaryMs: 3800, binaryN: 20 }));
const mixed = R.speedScore({ binaryMs: 16000, binaryN: 30, gapMs: 4000, gapN: 10 });
const slowTap = R.paceScore(16000, 4), fastType = R.paceScore(4000, 10);
check("a mix is weighted by how many of each",
  near(mixed, (slowTap * 30 + fastType * 10) / 40, 1e-9));
check("the displayed average is a plain average over everything timed",
  R.averagePace({ binaryMs: 4000, binaryN: 3, gapMs: 8000, gapN: 1 }) === 5000);

console.log("\nthe mix");
check("streak weighs most, then XP, then speed",
  R.WEIGHTS.streak > R.WEIGHTS.xp && R.WEIGHTS.xp > R.WEIGHTS.speed);
check("the weights add up to one", near(R.WEIGHTS.streak + R.WEIGHTS.xp + R.WEIGHTS.speed, 1, 1e-9));
check("the same lead is worth more in streak than in XP",
  R.overallScore({ streak: 80, xp: 20, speed: 50 }) > R.overallScore({ streak: 20, xp: 80, speed: 50 }));
check("and more in XP than in speed",
  R.overallScore({ streak: 50, xp: 80, speed: 20 }) > R.overallScore({ streak: 50, xp: 20, speed: 80 }));
check("someone with no speed yet is not dragged down by it",
  near(R.overallScore({ streak: 60, xp: 60, speed: null }), 60, 1e-9));
check("everything at 100 is 100", near(R.overallScore({ streak: 100, xp: 100, speed: 100 }), 100, 1e-9));

console.log("\nrating a player");
const r = R.rate({ streak: 30, lastDay: "2026-09-26", xp: 6000, timing: { binaryMs: 3000, binaryN: 5 } }, today);
check("the three parts come back", near(r.streak, 63.2) && near(r.xp, 63.2) && r.speed === 100);
check("with the raw numbers alongside", r.raw.streak === 30 && r.raw.xp === 6000 && r.raw.pace === 3000);
const lapsed = R.rate({ streak: 30, lastDay: "2026-09-01", xp: 6000 }, today);
check("a lapsed streak scores as no streak", lapsed.streak === 0 && lapsed.raw.streak === 0);

console.log("\nplaces");
check("the top score is first", R.rankOf(90, [90, 80, 70]) === 1);
check("ties share a place", R.rankOf(80, [90, 80, 80, 70]) === 2);
check("and the next one down skips", R.rankOf(70, [90, 80, 80, 70]) === 4);
check("no score has no place", R.rankOf(null, [1, 2]) === null);

// Ratings shaped exactly as rate() returns them.
const rated = (overall, streak, xp, pace) => ({ overall, raw: { streak, xp, pace } });
const players = [
  { key: "a", name: "Ali", rating: rated(70, 20, 9000, 6000) },
  { key: "b", name: "Bek", rating: rated(90, 60, 5000, 4000) },
  { key: "me", name: "Old me", rating: rated(10, 1, 100, 9000) },
];
const meNow = { key: "me", name: "You", rating: rated(80, 30, 7000, 5000) };
const s = R.standings("overall", players, meNow);
check("the viewer is counted once, not twice", s.total === 3);
check("and scored on their live numbers, not what they last sent", s.me.score === 80);
check("so they are second", s.me.place === 2);
check("the board is sorted best first", s.rows.map((x) => x.key).join() === "b,me,a");
const byXp = R.standings("xp", players, meNow);
check("each board ranks on its own number", byXp.rows[0].key === "a" && byXp.me.place === 2);
const byStreak = R.standings("streak", players, meNow);
check("the streak board ranks on days", byStreak.rows.map((x) => x.key).join() === "b,me,a");
const bySpeed = R.standings("speed", players, meNow);
check("the speed board puts the fastest first", bySpeed.rows.map((x) => x.key).join() === "b,me,a");

// The bug this guards against: the speed board once sorted on the
// type-adjusted score while showing plain seconds, and printed a 5.5s player
// below a 7.2s one. Every board must read in order of the number it shows.
const mixedField = [
  { key: "typist", name: "T", rating: R.rate({ streak: 5, lastDay: today, xp: 900, timing: { binaryMs: 3900, binaryN: 40, gapMs: 8200, gapN: 60 } }, today) },
  { key: "tapper", name: "P", rating: R.rate({ streak: 5, lastDay: today, xp: 900, timing: { binaryMs: 5500, binaryN: 100 } }, today) },
  { key: "slow", name: "S", rating: R.rate({ streak: 5, lastDay: today, xp: 900, timing: { binaryMs: 7200, binaryN: 100 } }, today) },
];
const shown = R.standings("speed", mixedField, null).rows.map((r) => r.rating.raw.pace);
check("the speed board reads fastest to slowest, whatever the mix of types",
  shown.every((p, i) => i === 0 || p >= shown[i - 1]), JSON.stringify(shown));
const typist = mixedField[0].rating, tapper = mixedField[1].rating;
check("while the overall rating still gives typing its allowance",
  typist.speed > tapper.speed && typist.raw.pace > tapper.raw.pace,
  `typist ${typist.speed.toFixed(1)} @ ${typist.raw.pace}ms vs tapper ${tapper.speed.toFixed(1)} @ ${tapper.raw.pace}ms`);
check("someone with nothing timed is left off the speed board",
  R.standings("speed", [{ key: "x", name: "X", rating: R.rate({ xp: 50 }, today) }], null).total === 0);
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

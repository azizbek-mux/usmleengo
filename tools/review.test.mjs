// Review on the Quiz tab: Mistakes, Saved and Weak topics, and the storage
// changes under them.

const R = await import(new URL("../src/lib/review.js", import.meta.url).href);
const S = await import(new URL("../src/lib/storage.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const q = (id, tags, type = "binary") => ({ id, type, tags, topic: id, q: "?", options: ["a", "b"], answer: 0 });
const bank = [
  q("r1", ["renal"]), q("r2", ["renal"]), q("r3", ["renal"]),
  q("p1", ["pharm"]), q("p2", ["pharm"]),
  q("c1", ["cardio", "pharm"]),
  q("h1", ["histo"]),
];

console.log("\nmistakes");
let s = { ...S.emptyState };
s = S.record(s, bank[0], false, 3000);
check("a wrong answer makes a mistake", R.mistakesIn(bank, s.seen).map((x) => x.id).join() === "r1");
check("and remembers it was the last answer", s.seen.r1.join() === "0,1,0");
s = S.record(s, bank[0], true, 3000);
check("answering it right takes it off", R.mistakesIn(bank, s.seen).length === 0 && s.seen.r1.join() === "1,1,1");
s = S.record(s, bank[0], false, 3000);
check("getting it wrong again puts it back", R.mistakesIn(bank, s.seen).length === 1);

console.log("\nanswers from before the last answer was kept");
check("never answered right: a mistake", R.isMistake([0, 2]));
check("right at some point: not counted — it may be fixed", !R.isMistake([1, 3]));
check("never wrong: not a mistake", !R.isMistake([2, 0]));
check("nothing at all: not a mistake", !R.isMistake(undefined));

console.log("\nsaved");
let t = S.toggleSaved({ ...S.emptyState }, "p1");
t = S.toggleSaved(t, "h1");
check("saving adds, newest first", t.saved.join() === "h1,p1");
check("the saved round lists them in that order", R.savedIn(bank, t.saved).map((x) => x.id).join() === "h1,p1");
t = S.toggleSaved(t, "p1");
check("saving again takes the bookmark off", t.saved.join() === "h1");
check("a saved question gone from the bank is skipped", R.savedIn(bank, ["gone", "h1"]).map((x) => x.id).join() === "h1");
let many = { ...S.emptyState };
for (let i = 0; i < S.SAVED_MAX + 20; i++) many = S.toggleSaved(many, `x${i}`);
check(`at most ${S.SAVED_MAX} are kept, dropping the oldest`, many.saved.length === S.SAVED_MAX && many.saved[0] === `x${S.SAVED_MAX + 19}`);

console.log("\nweak topics");
const seen = {
  r1: [0, 3, 0], r2: [1, 1, 1], r3: [0, 1, 0], // renal: 1 right of 6
  p1: [4, 0, 1], p2: [3, 1, 1],                 // pharm: 7 of 8 (+ c1 below)
  c1: [2, 0, 1],                                // cardio 2 of 2 (too few); pharm gains 2 right
  h1: [0, 1, 0],
};
const rows = R.topicAccuracy(bank, seen, ["pharm", "renal", "cardio", "histo"]);
check("weakest first", rows[0].tag === "renal" && rows[0].pct === 17, JSON.stringify(rows[0]));
check("a question in two categories counts in both", rows[1].tag === "pharm" && rows[1].answered === 10 && rows[1].pct === 90,
  JSON.stringify(rows[1]));
check(`fewer than ${R.MIN_ANSWERS} answers is not judged, and comes last`,
  rows[2].pct === null && rows[3].pct === null && ["cardio", "histo"].includes(rows[2].tag));

console.log("\nstorage");
const back = JSON.parse(JSON.stringify({ ...S.emptyState, saved: ["a", "a", 7, "b"] }));
localStorageShim(JSON.stringify(back));
const loaded = S.loadLocal();
check("saved questions are read back cleaned", loaded.saved.join() === "a,b", JSON.stringify(loaded.saved));
localStorageShim(JSON.stringify({ ...S.emptyState, xp: 5 }));
check("an old copy without saved reads as none", Array.isArray(S.loadLocal().saved) && S.loadLocal().saved.length === 0);

function localStorageShim(value) {
  globalThis.localStorage = { getItem: () => value, setItem() {}, removeItem() {} };
}

console.log("\nthe how-to cards");
check("a brand-new player gets them", S.isNewPlayer({ ...S.emptyState }));
check("not once they've been seen", !S.isNewPlayer({ ...S.emptyState, introSeen: true }));
check("not someone who has answered questions", !S.isNewPlayer({ ...S.emptyState, answered: 12 }));
check("nor someone who has only done flashcards (a day studied)", !S.isNewPlayer({ ...S.emptyState, lastDay: "2026-09-28" }));
globalThis.localStorage = { getItem: () => JSON.stringify({ introSeen: true }), setItem() {}, removeItem() {} };
check("having seen them is kept in the saved progress", S.loadLocal().introSeen === true);
globalThis.localStorage = { getItem: () => JSON.stringify({ introSeen: "yes" }), setItem() {}, removeItem() {} };
check("and only a real true counts", S.loadLocal().introSeen === false);

console.log("\nprogress by system and subject");
{
  const pq = (id, system, subject) => ({ id, type: "binary", tags: [], system, subject, topic: id, q: "?", options: ["a", "b"] });
  const pbank = [
    pq("a1", "renal", "physiology"), pq("a2", "renal", "physiology"), pq("a3", "renal", "pathology"),
    pq("b1", "cardiovascular", "pharmacology"), pq("b2", "cardiovascular", "pharmacology"),
    pq("c1", "dermatology", "pathology"),
  ];
  const ids = ["renal", "cardiovascular", "dermatology", "nervous"];
  let ps = { ...S.emptyState };
  // renal: 4 right + 2 wrong over two questions; cardiovascular: 1 right, 4 wrong over one
  for (let i = 0; i < 4; i++) ps = S.record(ps, pbank[0], true, 3000);
  for (let i = 0; i < 2; i++) ps = S.record(ps, pbank[1], false, 3000);
  ps = S.record(ps, pbank[3], true, 3000);
  for (let i = 0; i < 4; i++) ps = S.record(ps, pbank[3], false, 3000);
  const rows = R.progressBy(pbank, ps.seen, "system", ids);
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));

  check("a system with no questions in the bank is left out", !by.nervous);
  check("total is the questions in it", by.renal.total === 3 && by.cardiovascular.total === 2 && by.dermatology.total === 1);
  check("seen counts the questions answered at least once", by.renal.seen === 2 && by.cardiovascular.seen === 1 && by.dermatology.seen === 0);
  check("answered and right count every answer", by.renal.answered === 6 && by.renal.right === 4 && by.cardiovascular.answered === 5);
  check("the percentage is right answers over answers", by.renal.pct === 67 && by.cardiovascular.pct === 20, `${by.renal.pct} ${by.cardiovascular.pct}`);
  check("weakest first", rows[0].id === "cardiovascular" && rows[1].id === "renal");
  check("too few answers to judge is null, and comes last", by.dermatology.pct === null && rows[rows.length - 1].id === "dermatology");
  check("four answers is still too few", R.progressBy(pbank, { c1: [3, 1] }, "system", ids).find((r) => r.id === "dermatology").pct === null);
  check("five is enough", R.progressBy(pbank, { c1: [4, 1] }, "system", ids).find((r) => r.id === "dermatology").pct === 80);

  const subj = R.progressBy(pbank, ps.seen, "subject", ["physiology", "pathology", "pharmacology"]);
  check("the same answers, read by subject", subj.find((r) => r.id === "physiology").answered === 6 && subj.find((r) => r.id === "pharmacology").answered === 5);
  check("every answer is in one system and one subject", rows.reduce((n, r) => n + r.answered, 0) === subj.reduce((n, r) => n + r.answered, 0));

  const totals = R.systemTotals(pbank, ps.seen, ids);
  check("the teacher is sent right/wrong by system", totals.renal?.join() === "4,2" && totals.cardiovascular?.join() === "1,4" && Object.keys(totals).length === 2, JSON.stringify(totals));
  check("only systems with answers", !("dermatology" in totals));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

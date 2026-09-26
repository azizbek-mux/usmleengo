// When a routine five-minute check may skip deploying. The failure that
// matters is a false "unchanged": the new score sits unpublished. So most of
// these make sure a real change is always seen.

const C = await import(new URL("./changed.mjs", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const player = { name: "Laylo", streak: 4, lastDay: 20722, xp: 900, answered: 90,
  timing: { binaryMs: 5000, binaryN: 40, gapMs: 0, gapN: 0 }, sentAt: 1790000000 };
const board = (patch = {}, players = { k1: player }) =>
  JSON.stringify({ version: 1, updatedAt: "2026-09-26T10:00:00Z", lastUpdateId: 7, players, ...patch });

console.log("\nthe leaderboard");
check("the same board written at a different time is unchanged",
  !C.differs(board({ updatedAt: "2026-09-26T10:05:00Z" }), board()));
check("one player's XP changing is a change — even though it is nested",
  C.differs(board({}, { k1: { ...player, xp: 915 } }), board()));
check("so is a timing buried two levels down",
  C.differs(board({}, { k1: { ...player, timing: { ...player.timing, binaryN: 41 } } }), board()));
check("a new player is a change", C.differs(board({}, { k1: player, k2: { ...player, name: "Bek" } }), board()));
check("someone leaving is a change", C.differs(board({}, {}), board()));
check("the read position moving is a change, so rejected messages are not re-read forever",
  C.differs(board({ lastUpdateId: 9 }), board()));
const reordered = JSON.stringify({ players: { k1: { ...player } }, lastUpdateId: 7, version: 1 });
check("the same data with its keys in another order is unchanged", !C.differs(reordered, board()));

console.log("\nthe announcement");
const ad = JSON.stringify({ id: 42, title: "Course", body: "Starts Monday" });
check("no announcement either side is unchanged", !C.differs("null", "null"));
check("a new post is a change", C.differs(ad, "null"));
check("an old post expiring is a change", C.differs("null", ad));
check("the same post is unchanged", !C.differs(ad, JSON.stringify({ id: 42, title: "Course", body: "Starts Monday" })));

console.log("\nwhen in doubt, deploy");
check("no live copy", C.differs(board(), null));
check("no local copy", C.differs(null, board()));
check("a live copy that is not JSON", C.differs(board(), "<html>404</html>"));

console.log("\nwho may skip");
check("a push never skips", !C.mayskip("push", ""));
check("Run workflow on GitHub never skips", !C.mayskip("workflow_dispatch", ""));
check("nor does an explicit force", !C.mayskip("workflow_dispatch", "true"));
check("the five-minute outside timer may", C.mayskip("workflow_dispatch", "false"));
check("so may GitHub's own timer", C.mayskip("schedule", ""));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

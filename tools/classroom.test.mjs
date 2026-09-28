// Classrooms, run for real: the Worker's own code on node:sqlite (the engine
// D1 is built on), every call signed as Telegram would sign it.

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const T = await import(new URL("../worker/src/telegram.js", import.meta.url).href);
const B = await import(new URL("../worker/src/board.js", import.meta.url).href);
const C = await import(new URL("../worker/src/classroom.js", import.meta.url).href);
const W = await import(new URL("../worker/src/index.js", import.meta.url).href);
const S = await import(new URL("../src/lib/scorecard.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

function mockD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(B.SCHEMA);
  db.exec(C.CLASS_SCHEMA);
  return {
    db,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
      };
      return stmt;
    },
  };
}

const TOKEN = "123456789:TEST-token-that-is-not-real";
const NOW = Date.parse("2026-09-28T12:00:00Z");
const TODAY = B.serverToday(NOW);
const d1 = mockD1();
const env = { DB: d1, BOT_TOKEN: TOKEN };
const cache = B.snapshotCache();

const people = {
  teacher: { id: 1001, first_name: "Dr", last_name: "Karimov", username: "drkarimov" },
  laylo: { id: 2001, first_name: "Laylo" },
  bek: { id: 2002, first_name: "Bek", username: "bek_md" },
  stranger: { id: 2999, first_name: "Stranger" },
};
const signed = {};
for (const [k, u] of Object.entries(people)) {
  signed[k] = await T.signInitData({ user: JSON.stringify(u), auth_date: String(Math.floor(NOW / 1000) - 60) }, TOKEN);
}
const score = (patch = {}) => ({
  streak: 5, lastDay: TODAY, xp: 800, answered: 90,
  timing: { binaryMs: 5000, binaryN: 50, gapMs: 0, gapN: 0 }, ...patch,
});
const call = (who, action, body = {}, now = NOW) =>
  W.handleClass(action, new Request(`https://w/class/${action}`, { method: "POST", body: JSON.stringify({ initData: signed[who], ...body }) }), env, cache, now);

console.log("\nwho may take part");
check("a call without Telegram is refused", (await W.handleClass("mine", new Request("https://w/class/mine", { method: "POST", body: "{}" }), env, cache, NOW)).status === 401);
const forged = signed.laylo.replace("Laylo", "Lay1o");
check("and so is a forged one", (await W.handleClass("mine", new Request("https://w/class/mine", { method: "POST", body: JSON.stringify({ initData: forged }) }), env, cache, NOW)).status === 401);
check("an unknown action is a 404", (await call("laylo", "hack")).status === 404);

console.log("\na class");
let r = await call("teacher", "create", { name: "  Cardio group ‮ " });
check("a teacher creates a class, named cleanly", r.status === 200 && r.body.class.name === "Cardio group" && /^\d{6}$/.test(r.body.class.code),
  JSON.stringify(r.body));
const cls = r.body.class;
check("a name is required", (await call("teacher", "create", { name: "   " })).status === 400);
r = await call("teacher", "mine");
check("it is listed as taught", r.body.teaching.length === 1 && r.body.teaching[0].students === 0);

console.log("\njoining");
check("a teacher cannot join their own class", (await call("teacher", "join", { code: cls.code })).body.error === "own-class");
check("a wrong code finds nothing", (await call("laylo", "join", { code: "000000" })).status === 404);
r = await call("laylo", "join", { code: cls.code, score: score(), detail: { correct: 60, topics: { renal: [10, 10], pharm: [30, 5] } } });
check("a student asks to join and waits", r.body.status === "pending" && r.body.class.name === "Cardio group");
check("joining carries their numbers to the server", d1.db.prepare("SELECT correct, topics FROM players").get().correct === 60);
check("asking twice changes nothing", (await call("laylo", "join", { code: cls.code })).body.status === "pending");
r = await call("laylo", "view", { classId: cls.id });
check("while waiting they see only that they are waiting", r.body.status === "pending" && !r.body.ranking);
await call("bek", "join", { code: cls.code, score: score({ xp: 300, answered: 40 }), detail: { correct: 30 } });
r = await call("teacher", "view", { classId: cls.id });
check("the teacher sees the requests", r.body.role === "teacher" && r.body.requests.map((x) => x.name).sort().join() === "Bek,Laylo");
check("and no students yet", r.body.students.length === 0);
const lay = r.body.requests.find((x) => x.name === "Laylo").player;
const bek = r.body.requests.find((x) => x.name === "Bek").player;

console.log("\napproving");
check("a student cannot approve anyone", (await call("bek", "approve", { classId: cls.id, player: lay, accept: true })).status === 403);
check("the teacher approves", (await call("teacher", "approve", { classId: cls.id, player: lay, accept: true })).status === 200);
check("and declines", (await call("teacher", "approve", { classId: cls.id, player: bek, accept: false })).status === 200);
r = await call("teacher", "mine");
check("counts follow", r.body.teaching[0].students === 1 && r.body.teaching[0].waiting === 0);
r = await call("bek", "mine");
check("a declined student is no longer in it", r.body.learning.length === 0);
check("and can ask again", (await call("bek", "join", { code: cls.code })).body.status === "pending");

console.log("\nwhat the teacher sees");
// Laylo studies after joining: 20 more answers, 18 right, all renal; faster.
await call("laylo", "mine", {
  score: score({ xp: 990, answered: 110, timing: { binaryMs: 4500, binaryN: 70, gapMs: 0, gapN: 0 } }),
  detail: { correct: 78, topics: { renal: [28, 12], pharm: [30, 5] } },
});
cache.clear();
r = await call("teacher", "view", { classId: cls.id });
const st = r.body.students[0];
check("each student with their name", st.name === "Laylo");
check("all-time: points, rank, streak, XP, answered", st.all.points > 0 && st.all.rank >= 1 && st.all.streak === 5 && st.all.xp === 990 && st.all.answered === 110);
check("accuracy", st.all.accuracy === Math.round((78 / 110) * 100));
check("weak topics, weakest first", st.all.weak[0].tag === "renal" && st.all.weak[0].pct === 70, JSON.stringify(st.all.weak));
check("since joining: only what came after", st.since.xp === 190 && st.since.answered === 20, JSON.stringify(st.since));
check("with its own accuracy", st.since.accuracy === 90);
check("its own weak topics", st.since.weak[0]?.tag === "renal" && st.since.weak[0].pct === 90 && st.since.weak.length === 1,
  JSON.stringify(st.since.weak));
check("and its own time", st.since.pace === Math.round((4500 * 70 - 5000 * 50) / 20), String(st.since.pace));
check("never anything bookmarked", !JSON.stringify(r.body).includes("saved"));

console.log("\nwhat a student sees");
await call("teacher", "approve", { classId: cls.id, player: bek, accept: true });
r = await call("bek", "view", { classId: cls.id });
check("the class ranking by points", r.body.role === "student" && r.body.ranking.top.length === 2 && r.body.ranking.top[0].points >= r.body.ranking.top[1].points);
check("with their own place", r.body.ranking.me.place === 2 && r.body.ranking.me.total === 2);
check("classmates by name, themselves without", r.body.ranking.top.find((x) => x.isMe).name === null && r.body.ranking.top.find((x) => !x.isMe).name === "Laylo");
check("but not the code or anyone's numbers beyond points", !("code" in r.body.class) && !JSON.stringify(r.body).includes("accuracy"));
check("a stranger sees nothing", (await call("stranger", "view", { classId: cls.id })).status === 403);

console.log("\nchanges");
check("the teacher renames it", (await call("teacher", "rename", { classId: cls.id, name: "Cardio A" })).status === 200 &&
  (await call("laylo", "view", { classId: cls.id })).body.class.name === "Cardio A");
check("a student cannot rename it", (await call("laylo", "rename", { classId: cls.id, name: "Mine" })).status === 403);
check("a student leaves", (await call("bek", "remove", { classId: cls.id })).status === 200 &&
  (await call("bek", "mine")).body.learning.length === 0);
check("a student cannot remove someone else", (await call("bek", "remove", { classId: cls.id, player: lay })).status === 403);
check("the teacher removes a student", (await call("teacher", "remove", { classId: cls.id, player: lay })).status === 200 &&
  (await call("teacher", "view", { classId: cls.id })).body.students.length === 0);
check("a student cannot close it", (await call("laylo", "close", { classId: cls.id })).status === 403);
check("the teacher closes it, and it is gone", (await call("teacher", "close", { classId: cls.id })).status === 200 &&
  (await call("teacher", "mine")).body.teaching.length === 0 &&
  d1.db.prepare("SELECT COUNT(*) n FROM members").get().n === 0);

console.log("\nlimits");
for (let i = 0; i < C.LIMITS.teaching; i++) await call("stranger", "create", { name: `Class ${i}` });
check(`a teacher runs at most ${C.LIMITS.teaching} classes`, (await call("stranger", "create", { name: "One more" })).body.error === "too-many-classes");

console.log("\nwhat a student may share");
check("right answers cannot exceed answers", S.checkDetail({ correct: 91 }, 90) === null);
check("categories must be real tags", S.checkDetail({ correct: 1, topics: { "<b>": [1, 0] } }, 90) === null);
check("and hold no more answers than there are", S.checkDetail({ correct: 1, topics: { renal: [60, 31] } }, 90) === null);
check("a real one passes, stored as text", S.checkDetail({ correct: 50, topics: { renal: [10, 5] } }, 90)?.topics === '{"renal":[10,5]}');

console.log("\nthe schema file");
const squash = (s) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").replace(/;\s*$/, "").trim();
check("classroom.sql matches the schema the code uses",
  squash(readFileSync(new URL("../worker/classroom.sql", import.meta.url), "utf8")) === squash(C.CLASS_SCHEMA));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

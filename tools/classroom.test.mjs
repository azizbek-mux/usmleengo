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
  streak: 5, lastDay: TODAY, points: 80000, answered: 90,
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
await call("bek", "join", { code: cls.code, score: score({ points: 30000, answered: 40 }), detail: { correct: 30 } });
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
  score: score({ points: 99000, answered: 110, timing: { binaryMs: 4500, binaryN: 70, gapMs: 0, gapN: 0 } }),
  detail: { correct: 78, topics: { renal: [28, 12], pharm: [30, 5] } },
});
cache.clear();
r = await call("teacher", "view", { classId: cls.id });
const st = r.body.students[0];
check("each student with their name", st.name === "Laylo");
check("all-time: points, rank, streak, answered", st.all.points === 990 && st.all.rank >= 1 && st.all.streak === 5 && st.all.answered === 110 && !("xp" in st.all), JSON.stringify(st.all));
check("accuracy", st.all.accuracy === Math.round((78 / 110) * 100));
check("weak topics, weakest first", st.all.weak[0].tag === "renal" && st.all.weak[0].pct === 70, JSON.stringify(st.all.weak));
check("since joining: only what came after - 190 points, 20 answers", st.since.points === 190 && st.since.answered === 20 && !("xp" in st.since), JSON.stringify(st.since));
check("with its own accuracy", st.since.accuracy === 90);
check("its own weak topics", st.since.weak[0]?.tag === "renal" && st.since.weak[0].pct === 90 && st.since.weak.length === 1,
  JSON.stringify(st.since.weak));
check("and its own time", st.since.pace === Math.round((4500 * 70 - 5000 * 50) / 20), String(st.since.pace));
check("points since joining are today's less the joining base's", typeof st.since.points === "number", JSON.stringify(st.since));
{
  // A student who joined before the rating changed has a base in the old
  // points. Subtracting them would be nonsense, so it says nothing instead.
  const baseJson = d1.db.prepare("SELECT base FROM members WHERE player = ?1 AND class_id = ?2").get(lay, cls.id).base;
  const old = JSON.parse(baseJson);
  delete old.v;
  d1.db.prepare("UPDATE members SET base = ?1 WHERE player = ?2 AND class_id = ?3").run(JSON.stringify(old), lay, cls.id);
  cache.clear();
  const legacy = (await call("teacher", "view", { classId: cls.id })).body.students[0];
  check("a base from before the rating changed gives no points figure, not a wrong one",
    legacy.since.points === null && legacy.since.answered === 20, JSON.stringify(legacy.since));
  d1.db.prepare("UPDATE members SET base = ?1 WHERE player = ?2 AND class_id = ?3").run(baseJson, lay, cls.id);
  cache.clear();
}
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

console.log("\nquestion packages");
const c2 = (await call("teacher", "create", { name: "Renal group" })).body.class;
await call("laylo", "join", { code: c2.code });
const req = (await call("teacher", "view", { classId: c2.id })).body.requests[0];
await call("teacher", "approve", { classId: c2.id, player: req.player, accept: true });
const questions = [
  { id: "q-acid", type: "choice", q: "Metabolic acidosis with a normal anion gap?", options: ["DKA", "Diarrhea", "Lactic acidosis", "Methanol"], answer: 1, explain: "Bicarbonate lost in stool." },
  { id: "q-k", type: "typed", q: "Hyperkalemia ECG: peaked ___ waves", answer: "T", accept: ["t wave"] },
  { id: "q-drug", type: "choice", q: "Loop diuretic?", options: ["Furosemide", "HCTZ"], answer: 0, topic: "Diuretics" },
];
r = await call("teacher", "savepackage", { classId: c2.id, package: { name: "Acid–base", questions } });
check("a teacher saves a package of their own questions", r.status === 200 && r.body.package.count === 3);
const pkgId = r.body.package.id;
check("a question with a bad answer is refused, and which one is said",
  (await call("teacher", "savepackage", { classId: c2.id, package: { name: "Bad", questions: [questions[0], { ...questions[2], answer: 5 }] } })).body.index === 1);
check("up to ten options", (await call("teacher", "savepackage", { classId: c2.id, package: { name: "Ten", questions: [{ type: "choice", q: "?", options: "abcdefghij".split(""), answer: 9 }] } })).status === 200 &&
  (await call("teacher", "savepackage", { classId: c2.id, package: { name: "Eleven", questions: [{ type: "choice", q: "?", options: "abcdefghijk".split(""), answer: 0 }] } })).status === 400);
check("a student cannot save one", (await call("laylo", "savepackage", { classId: c2.id, package: { name: "Mine", questions } })).status === 403);
r = await call("laylo", "package", { packageId: pkgId });
check("a student of the class opens it", r.status === 200 && r.body.package.questions.length === 3 && r.body.package.questions[0].options.length === 4);
check("an outsider cannot", (await call("stranger", "package", { packageId: pkgId })).status === 403);
r = await call("teacher", "savepackage", { classId: c2.id, package: { id: pkgId, name: "Acid–base basics", questions } });
check("saving again replaces it in place", r.body.package.id === pkgId && (await call("laylo", "view", { classId: c2.id })).body.packages.some((p) => p.name === "Acid–base basics"));

console.log("\nassignments");
check("a due date in the past is refused", (await call("teacher", "assign", { packageId: pkgId, dueAt: NOW - 1000 })).body.error === "due");
r = await call("teacher", "assign", { packageId: pkgId, dueAt: NOW + 3 * 86400000, title: "For Friday" });
check("the teacher sets it as homework", r.status === 200 && r.body.assignment.title === "For Friday");
const asg = r.body.assignment.id;
r = await call("laylo", "view", { classId: c2.id });
check("the student sees it, not yet done", r.body.assignments[0].title === "For Friday" && r.body.assignments[0].mine === null);
r = await call("laylo", "attempt", { assignmentId: asg, answers: { "q-acid": 1, "q-k": "t ", "q-drug": 1 } });
check("handed in, it is graded on the server", r.status === 200 && r.body.first === true && r.body.score === 2 && r.body.total === 3, JSON.stringify(r.body));
r = await call("laylo", "attempt", { assignmentId: asg, answers: { "q-acid": 1, "q-k": "t", "q-drug": 0 } });
check("only the first attempt counts", r.body.first === false && r.body.score === 2);
check("the teacher cannot hand one in", (await call("teacher", "attempt", { assignmentId: asg, answers: {} })).status === 403);
r = await call("laylo", "view", { classId: c2.id });
check("the student sees their score", r.body.assignments[0].mine.score === 2 && r.body.assignments[0].mine.late === false);
r = await call("teacher", "results", { assignmentId: asg });
check("the teacher sees who did it and their score", r.body.students[0].done && r.body.students[0].score === 2 && r.body.students[0].name === "Laylo");
check("and how the class did on each question", r.body.questions.map((q) => q.pct).join() === "100,100,0", JSON.stringify(r.body.questions));
check("the view counts hand-ins", (await call("teacher", "view", { classId: c2.id })).body.assignments[0].done === 1);
const late = (await call("teacher", "assign", { packageId: pkgId, dueAt: NOW + 60000 })).body.assignment.id;
r = await call("laylo", "attempt", { assignmentId: late, answers: { "q-acid": 1 } }, NOW + 120000);
check("handed in after the deadline, it is marked late", r.body.late === true);

console.log("\npictures");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64").toString("base64");
r = await call("teacher", "image", { classId: c2.id, mime: "image/png", data: png });
check("a teacher uploads a picture and gets its reference", r.status === 200 && /^c:[0-9a-f]+$/.test(r.body.img));
const served = await C.servedImage(d1, r.body.img.slice(2));
check("which is served back byte for byte", served && served.mime === "image/png" && Buffer.from(served.bytes).toString("base64") === png);
check("a question can use it", (await call("teacher", "savepackage", { classId: c2.id, package: { name: "With a picture", questions: [{ type: "choice", q: "", img: r.body.img, options: ["A", "B"], answer: 0 }] } })).status === 200);
check("only pictures are taken", (await call("teacher", "image", { classId: c2.id, mime: "text/html", data: png })).body.error === "image-type");
check("and only from the teacher", (await call("laylo", "image", { classId: c2.id, mime: "image/png", data: png })).status === 403);

console.log("\nremoving");
check("deleting a package takes its homework with it", (await call("teacher", "deletepackage", { packageId: pkgId })).status === 200 &&
  (await call("teacher", "view", { classId: c2.id })).body.assignments.length === 0 &&
  d1.db.prepare("SELECT COUNT(*) n FROM attempts").get().n === 0);
await call("teacher", "close", { classId: c2.id });
check("closing a class leaves nothing of it behind",
  ["packages", "assignments", "images", "members"].every((t) => d1.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n === 0));

console.log("\nthe bot");
{
  const BOT = await import(new URL("../worker/src/bot.js", import.meta.url).href);
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("/getFile")) return new Response(JSON.stringify({ ok: true, result: { file_path: "documents/file_1.docx" } }));
    if (u.includes("/file/bot")) return new Response("PK-file-bytes");
    sent.push({ method: u.split("/").pop(), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ ok: true, result: true }));
  };
  const benv = { DB: d1, BOT_TOKEN: TOKEN, WEBHOOK_SECRET: "hook-secret" };
  // A list's reply waits for a quiet moment after the response; here the
  // quiet moment comes when the test says so (flush).
  const pending = [];
  let gates = [];
  const ctx = { waitUntil: (work) => pending.push(work) };
  const quiet = () => new Promise((resolve) => gates.push(resolve));
  const flush = async () => { const open = gates; gates = []; open.forEach((go) => go()); await Promise.all(pending.splice(0)); };
  const update = (message, secret = "hook-secret", now = NOW) => BOT.handleBot(new Request("https://w/bot", {
    method: "POST", headers: { "x-telegram-bot-api-secret-token": secret }, body: JSON.stringify({ message }),
  }), benv, now, ctx, quiet);
  const from = { id: 1001, first_name: "Dr" };
  const chat = { id: 1001, type: "private" };

  check("a call without Telegram's secret is refused", (await update({ from, chat, text: "/start" }, "wrong")).status === 403);
  await update({ from, chat, text: "/start" });
  check("/start is welcomed, with a button into the app",
    sent.at(-1).method === "sendMessage" && sent.at(-1).body.reply_markup.inline_keyboard[0][0].url === BOT.APP_LINK);
  await update({ from, chat, text: "/format" });
  check("/format sends the example", sent.at(-1).body.text.includes("Ethosuximide"));
  check("with a button that opens Telegram's quiz maker",
    sent.at(-1).body.reply_markup.keyboard[0][0].request_poll.type === "quiz");
  // Both languages, every time. The bot cannot see which one the person
  // reads the app in, so it sends both and leads with their phone's.
  check("/start comes in English and Uzbek",
    /6,600\+ USMLE quizzes/.test(sent.at(-2).body.text) && /6 600\+ USMLE savoli/.test(sent.at(-2).body.text));
  check("/format shows the example in both, with the Uzbek words",
    /Ethosuximide/.test(sent.at(-1).body.text) && /Etosuksimid/.test(sent.at(-1).body.text) &&
    /Javob:/.test(sent.at(-1).body.text));
  await update({ from: { ...from, language_code: "uz" }, chat, text: "/start" });
  const uzStart = sent.at(-1).body;
  check("an Uzbek phone is answered in Uzbek first",
    uzStart.text.indexOf("USMLE savoli") < uzStart.text.indexOf("USMLE quizzes") &&
    uzStart.reply_markup.inline_keyboard[0][0].text === "usmleengoni ochish");
  await update({ from: { ...from, language_code: "ru" }, chat, text: "/start" });
  check("any other phone is answered in English first, and still gets the Uzbek",
    sent.at(-1).body.text.indexOf("USMLE quizzes") < sent.at(-1).body.text.indexOf("USMLE savoli"));

  await update({ from, chat, document: { file_id: "F1", file_name: "Cardio week 3.docx", file_size: 40000 } });
  const link = sent.at(-1).body.reply_markup.inline_keyboard[0][0].url;
  check("a question file is answered with a link that opens the app on it", /\?startapp=f[0-9a-f]{32}$/.test(link), link);
  const token = link.split("startapp=f")[1];
  await update({ from, chat, document: { file_id: "F2", file_name: "notes.xlsx", file_size: 100 } });
  check("a file it cannot read gets an explanation, not a link", /Word \(\.docx\)/.test(sent.at(-1).body.text) && !sent.at(-1).body.reply_markup);
  check("and the explanation is in both languages", /o'qiy olaman/.test(sent.at(-1).body.text));
  const before = sent.length;
  await update({ from, chat: { id: -5, type: "group" }, text: "/start" });
  check("in a group chat it stays quiet", sent.length === before);

  const teacherMe = { key: S.playerKey(1001) };
  const got = await BOT.fetchUpload(benv, teacherMe, token, NOW);
  check("the sender gets the file back, streamed from Telegram", got.response && (await got.response.text()) === "PK-file-bytes" &&
    decodeURIComponent(got.response.headers.get("x-file-name")) === "Cardio week 3.docx");
  check("nobody else does", (await BOT.fetchUpload(benv, { key: S.playerKey(2001) }, token, NOW)).status === 403);
  check("and not after two days", (await BOT.fetchUpload(benv, teacherMe, token, NOW + 3 * 86400000)).status === 404);

  // Questions typed into the chat.
  const send = async (message, seconds = 0) => { await update({ from, chat, ...message }, "hook-secret", NOW + seconds * 1000); await flush(); };
  const say = (text, seconds = 0) => send({ text }, seconds);
  const reply = () => sent.at(-1).body;
  const linkOf = (body) => body.reply_markup?.inline_keyboard[0][0].url || "";
  const lists = () => d1.db.prepare("SELECT COUNT(*) n FROM uploads WHERE text IS NOT NULL").get().n;
  await say("hello");
  check("a message with no questions gets the welcome, and starts no list", linkOf(reply()) === BOT.APP_LINK && lists() === 0);
  await say("1. Which drug is a loop diuretic?\nA) Hydrochlorothiazide\nB) Furosemide\nAnswer: B\n\n2. Hyperkalemia ECG: peaked ___ waves\nAnswer: T");
  const textLink = linkOf(reply());
  check("typed questions are counted, with a link into the app",
    /<b>2 questions<\/b>\./.test(reply().text) && /\?startapp=f[0-9a-f]{32}$/.test(textLink), reply().text);
  check("and counted in Uzbek as well", /<b>2 ta savol<\/b> bor\./.test(reply().text), reply().text);
  await say("3. Most common valve lesion in rheumatic heart disease?\nA) Aortic stenosis", 10);
  check("the next message joins the same list, and a half-written question is flagged",
    /3 questions<\/b> — 1 to fix/.test(reply().text) && linkOf(reply()) === textLink, reply().text);
  check("the Uzbek half says the same", /3 ta savol<\/b> bor — 1 tasini ilovada tuzatish/.test(reply().text), reply().text);
  await say("B) Mitral stenosis\nAnswer: B", 20);
  check("the rest of a long paste, a moment later, joins it too",
    /3 questions<\/b>\./.test(reply().text) && !/to fix/.test(reply().text), reply().text);
  await say("thanks!", 600);
  check("a remark minutes later doesn't", linkOf(reply()) === BOT.APP_LINK && lists() === 1);
  const textToken = textLink.split("startapp=f")[1];
  check("nobody else can open the list", (await BOT.fetchUpload(benv, { key: S.playerKey(2001) }, textToken, NOW)).status === 403);
  const list = await BOT.fetchUpload(benv, teacherMe, textToken, NOW);
  const listText = await list.response.text();
  check("the sender gets it as a text file, in the order sent",
    decodeURIComponent(list.response.headers.get("x-file-name")) === BOT.TEXT_NAME &&
    listText.indexOf("Furosemide") < listText.indexOf("Aortic") && listText.indexOf("Aortic") < listText.indexOf("Mitral"));
  const P = await import(new URL("../src/lib/qformat.js", import.meta.url).href);
  const read = P.parseQuestions([{ text: listText }]).questions;
  check("and the app reads the same three questions from it", read.length === 3 && read.every((q) => !q.problem) && read[2].answer === 1);
  await say("4. First-line drug for absence seizures?\nA) Phenytoin\nB) Ethosuximide *", 700);
  check("once opened, the next message starts a new list", /<b>1 question<\/b>/.test(reply().text) && linkOf(reply()) !== textLink && lists() === 2);
  await update({ from, chat, photo: [{ file_id: "P1" }] });
  check("a photo is explained, not taken", /can't add photos/.test(reply().text) && !reply().reply_markup);

  // Quizzes: Telegram polls, made in the chat or forwarded.
  const tokenOf = (body) => linkOf(body).split("startapp=f")[1];
  await BOT.fetchUpload(benv, teacherMe, tokenOf(sent.at(-2).body), NOW); // opening list 2 closes it (the last reply was the photo's)
  const options = (...texts) => texts.map((text) => ({ text, voter_count: 0 }));
  await send({ poll: {
    type: "quiz", question: "Most common cause of\nnephrotic syndrome in children?",
    options: options("FSGS", "Minimal change disease", "Membranous nephropathy"),
    correct_option_id: 1, explanation: "Podocyte effacement\non electron microscopy.",
  } }, 800);
  check("a quiz made in the chat comes with its answer", /<b>1 question<\/b>\./.test(reply().text) && !/to fix/.test(reply().text) && lists() === 3, reply().text);
  const forwarded = (question) => ({ forward_origin: { type: "channel" }, poll: { type: "quiz", question, options: options("Phenytoin", "Ethosuximide", "Valproate") } });
  await send(forwarded("Drug of choice for absence seizures?"), 810);
  check("a forwarded quiz whose answer Telegram hides is flagged, and the reply says why",
    /2 questions<\/b> — 1 to fix/.test(reply().text) && /forwarded quiz/.test(reply().text), reply().text);
  const beforeBurst = sent.length;
  for (const q of ["Drug for trigeminal neuralgia?", "Drug causing gingival hyperplasia?", "Drug safest in pregnancy?"]) {
    await update({ from, chat, ...forwarded(q) }, "hook-secret", NOW + 820 * 1000);
  }
  await flush();
  check("thirty quizzes forwarded at once get one reply, not thirty",
    sent.length === beforeBurst + 1 && /5 questions<\/b> — 4 to fix/.test(reply().text), `${sent.length - beforeBurst} replies: ${reply().text}`);
  const quizList = await BOT.fetchUpload(benv, teacherMe, tokenOf(reply()), NOW);
  const quizzes = P.parseQuestions([{ text: await quizList.response.text() }]).questions;
  check("the app reads each quiz as a question: its options, its answer, its explanation",
    quizzes.length === 5 && quizzes[0].q === "Most common cause of nephrotic syndrome in children?" &&
    quizzes[0].options.length === 3 && quizzes[0].answer === 1 && quizzes[0].explain === "Podocyte effacement on electron microscopy." &&
    quizzes[1].answer === -1 && quizzes[1].problem === "No right answer marked." && quizzes[4].q === "Drug safest in pregnancy?");
  // Two arriving at the very same moment, with no list open: still one list.
  const listsBefore = lists();
  await Promise.all([forwarded("Mechanism of ethosuximide?"), forwarded("Mechanism of valproate?")]
    .map((m) => update({ from, chat, ...m }, "hook-secret", NOW + 900 * 1000)));
  await flush();
  const both = d1.db.prepare("SELECT text FROM uploads WHERE text IS NOT NULL AND opened = 0").all();
  check("quizzes arriving together land in one list, neither lost",
    lists() === listsBefore + 1 && both.length === 1 && /ethosuximide\?/.test(both[0].text) && /valproate\?/.test(both[0].text));
  const setup = (key) => BOT.setupBot(new Request("https://rating.example/bot/setup", { method: "POST", headers: { "x-setup-key": key } }), benv);
  check("setting the bot up needs the key", (await setup("nope")).status === 403);
  await setup("hook-secret");
  const hook = sent.find((s) => s.method === "setWebhook");
  check("and points Telegram's webhook here, with the secret", hook.body.url === "https://rating.example/bot" && hook.body.secret_token === "hook-secret");
  // What people see before they type: a menu button into the app, and the
  // descriptions, each in English and in Uzbek.
  const menu = sent.find((s) => s.method === "setChatMenuButton");
  check("puts a button that opens the app beside the message box",
    menu?.body.menu_button.type === "web_app" && menu.body.menu_button.web_app.url === BOT.APP_URL && menu.body.menu_button.text.length > 0);
  check("with the app's own address, not the t.me link", BOT.APP_URL.startsWith("https://") && !BOT.APP_URL.includes("t.me"));
  const described = (method) => sent.filter((s) => s.method === method);
  check("describes the bot on the empty chat, in English and in Uzbek",
    described("setMyDescription").length === 2 &&
    described("setMyDescription").filter((d) => d.body.language_code === "uz").length === 1 &&
    described("setMyDescription").every((d) => d.body.description.length > 40 && d.body.description.length <= 512));
  check("and on its profile, within Telegram's 120 characters",
    described("setMyShortDescription").length === 2 &&
    described("setMyShortDescription").every((d) => d.body.short_description.length > 20 && d.body.short_description.length <= 120));
  check("the Uzbek text is Uzbek",
    described("setMyDescription").find((d) => d.body.language_code === "uz").body.description.includes("Bepul"));
  check("the command lists are set too, in both languages",
    sent.filter((s) => s.method === "setMyCommands").length === 2);

  // The size of the bank, said the same everywhere: the bot's welcome and
  // descriptions must agree with the compiled bank to the nearest hundred.
  try {
    const compiled = JSON.parse(readFileSync(new URL("../public/questions.json", import.meta.url), "utf8"));
    const hundreds = Math.floor(compiled.length / 100) * 100;
    check(`the bot says ${BOT.COUNT_EN}, and the bank has ${compiled.length.toLocaleString()}`,
      BOT.COUNT_EN === `${hundreds.toLocaleString("en-US")}+` && BOT.COUNT_UZ === `${hundreds.toLocaleString("en-US").replace(",", " ")}+`);
    check("the welcome carries it in both languages", BOT.WELCOME_EN.includes(BOT.COUNT_EN) && BOT.WELCOME_UZ.includes(BOT.COUNT_UZ));
  } catch { /* the bank is compiled by npm run build; without it there is nothing to compare */ }
  globalThis.fetch = realFetch;
}

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

// The multiplayer game: its scoring, the question picking, whole games
// played through the rules in worker/src/game.js, and the room around them
// (worker/src/room.js) driven through a stand-in for Cloudflare.

const L = await import(new URL("../src/lib/game.js", import.meta.url).href);
const G = await import(new URL("../worker/src/game.js", import.meta.url).href);
const R = await import(new URL("../worker/src/room.js", import.meta.url).href);
const W = await import(new URL("../worker/src/index.js", import.meta.url).href);
const T = await import(new URL("../worker/src/telegram.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

/* ── points ────────────────────────────────────────────────────────────── */
console.log("\npoints");
check("an instant tapped answer is worth 2,000", L.gamePoints("binary", true, 15000, 15000) === 2000);
check("the example: 12 of 15 seconds left is 1,800", L.gamePoints("binary", true, 12000, 15000) === 1800);
check("at the last second, the plain 1,000", L.gamePoints("binary", true, 0, 15000) === 1000);
check("a typed answer is worth half as much again", L.gamePoints("gap", true, 15000, 15000) === 3000 &&
  L.gamePoints("gap", true, 0, 15000) === 1500);
check("a wrong answer is worth nothing, however fast", L.gamePoints("binary", false, 15000, 15000) === 0);
check("late or early never goes outside the range",
  L.gamePoints("binary", true, -500, 15000) === 1000 && L.gamePoints("binary", true, 99999, 15000) === 2000);

/* ── picking questions ─────────────────────────────────────────────────── */
console.log("\npicking questions");
const bank = [];
for (let i = 0; i < 40; i++) bank.push({ id: `b${i}`, type: "binary", topic: `Topic ${i}`, tags: [i % 2 ? "cardio" : "renal"],
  q: `Question ${i}?`, options: ["Right", "Wrong"], answer: 0, explain: "Because." });
for (let i = 0; i < 10; i++) bank.push({ id: `g${i}`, type: "gap", topic: `Gap ${i}`, tags: ["cardio"],
  q: `Blank ___ ${i}`, answer: "B3", accept: ["b3", "niacin"], explain: "Pellagra." });
bank.push({ id: "img1", type: "binary", topic: "Picture", tags: ["histo"], q: "", img: "p01-a.webp",
  options: ["A", "B"], answer: 0, explain: "", hideTopic: true });

const tapped = L.pickGameQuestions(bank, { qtype: "binary", count: 10 });
check("ten questions when ten are asked for", tapped.length === 10);
check("tap only means no typed ones", tapped.every((q) => q.type === "binary"));
check("no question twice in one game", new Set(tapped.map((q) => q.id)).size === 10);
check("typed only means typed only", L.pickGameQuestions(bank, { qtype: "gap", count: 30 }).every((q) => q.type === "gap"));
check("topics narrow it", L.pickGameQuestions(bank, { tags: ["renal"], qtype: "binary", count: 30 })
  .every((q) => bank.find((b) => b.id === q.id).tags.includes("renal")));
check("a narrow topic gives what it has", L.pickGameQuestions(bank, { tags: ["histo"], qtype: "binary", count: 10 }).length === 1);
check("and says so beforehand", L.availableFor(bank, { tags: ["histo"], qtype: "binary" }) === 1);
const seen = new Set();
for (let i = 0; i < 30; i++) for (const q of L.pickGameQuestions(bank, { tags: ["renal"], qtype: "binary", count: 5 })) seen.add(q.id);
check("no history: across games every question in the topic comes up", seen.size === 20, `${seen.size} of 20`);
const trimmed = L.forGame(bank.find((q) => q.id === "img1"));
check("a picture question keeps its picture and hidden topic", trimmed.img === "p01-a.webp" && trimmed.hideTopic === true);
check("and carries nothing a game does not need", !("tags" in trimmed) && !("difficulty" in trimmed));

console.log("\ninvite links");
check("the link opens the app on the game", L.inviteLink("https://t.me/usmleengo_bot/study", "482193") ===
  "https://t.me/usmleengo_bot/study?startapp=g482193");
check("and the app reads the code back", L.codeFromParam("g482193") === "482193");
check("anything else is not a game", L.codeFromParam("g48219") === null && L.codeFromParam("x482193") === null &&
  L.codeFromParam(undefined) === null);
check("codes are six digits", /^\d{6}$/.test(W.randomCode()) && W.randomCode() >= "100000");

/* ── what the creator may send ─────────────────────────────────────────── */
console.log("\nwhat the creator may send");
const forGame = bank.map(L.forGame);
check("real questions pass", G.cleanQuestions(forGame.slice(0, 30)) !== null);
check("thirty-one do not", G.cleanQuestions(forGame.slice(0, 31)) === null);
check("nor none", G.cleanQuestions([]) === null && G.cleanQuestions("x") === null);
check("a two-option question needs exactly two options",
  G.cleanQuestion({ ...forGame[0], options: ["a", "b", "c"] }) === null);
check("and an answer that is one of them", G.cleanQuestion({ ...forGame[0], answer: 2 }) === null);
check("a typed question needs answers to accept", G.cleanQuestion({ ...forGame[40], accept: [] }) === null);
check("a picture name cannot reach outside the picture folder",
  G.cleanQuestion({ ...forGame[50], img: "../../secret" }) === null);
check("an unknown kind of question is refused", G.cleanQuestion({ ...forGame[0], type: "essay" }) === null);
const okSettings = G.cleanSettings({ seconds: 15, qtype: "mixed", count: 10, tags: ["cardio", "histo", "cardio"] });
check("settings from the lists pass", okSettings?.seconds === 15 && okSettings.count === 10);
check("with the topics, once each", okSettings?.tags.join() === "cardio,histo");
check("5 and 25 seconds are choices too", G.cleanSettings({ seconds: 5, qtype: "binary", count: 10 })?.seconds === 5 &&
  G.cleanSettings({ seconds: 25, qtype: "binary", count: 10 })?.seconds === 25);
check("anything else does not", G.cleanSettings({ seconds: 7, qtype: "binary", count: 10 }) === null &&
  G.cleanSettings({ seconds: 15, qtype: "all", count: 10 }) === null &&
  G.cleanSettings({ seconds: 15, qtype: "binary", count: 12 }) === null);
check("a topic that is not a tag is dropped", G.cleanSettings({ seconds: 15, qtype: "binary", count: 5, tags: ["<b>", "renal"] }).tags.join() === "renal");

/* ── a whole game ──────────────────────────────────────────────────────── */
console.log("\na whole game");
const T0 = Date.parse("2026-09-27T15:00:00Z");
const id = (n) => `client-${String(n).padStart(12, "0")}`;
const makeGame = (questions = forGame.slice(0, 3), settings = { seconds: 15, qtype: "binary", count: 5, tags: [] }) =>
  G.newGame({ code: "482193", settings, questions, creatorToken: "tok", now: T0, random: () => 0.9 });

let g = makeGame();
const host = G.join(g, { clientId: id(1), name: "Aziz", creatorToken: "tok" }, T0).pid;
const laylo = G.join(g, { clientId: id(2), name: "Laylo" }, T0).pid;
check("the creator hosts", G.hostOf(g) === host && g.creator === host);
check("a guest with a wrong token does not", G.join(g, { clientId: id(3), name: "Bek", creatorToken: "nope" }, T0).pid !== g.creator);
G.leave(g, "p3", T0);
check("leaving the lobby gives the seat up", !g.players.p3 && Object.keys(g.players).length === 2);
check("a guest cannot start it", G.start(g, laylo, T0).error === "not-host");
check("a made-up phone id is refused", G.join(g, { clientId: "short", name: "X" }, T0).error === "bad-client");

const solo = makeGame();
const soloHost = G.join(solo, { clientId: id(1), name: "Aziz", creatorToken: "tok" }, T0).pid;
check("nobody plays alone", G.start(solo, soloHost, T0).error === "too-few");

check("the host starts it", G.start(g, host, T0).ok);
check("with a moment to get ready", g.phase === "question" && g.opensAt === T0 + G.GET_READY_MS);
check("and nobody new can walk in", G.join(g, { clientId: id(9), name: "Late" }, T0).error === "started");

let v = G.view(g, laylo, T0);
check("a phone is told the question", v.question.q === forGame[0].q && v.question.options.length === 2);
check("but never the answer while it is open", !("solution" in v) && !JSON.stringify(v).includes('"answer"'));
check("the options were shuffled on the server", g.questions[0].answer === 1 && g.questions[0].options[1] === "Right");

const open = g.opensAt;
check("an answer before the question opens is refused", G.answer(g, host, { index: 0, choice: 1 }, open - 2000).error === "not-now");
const a1 = G.answer(g, host, { index: 0, choice: 1 }, open + 3000);
check("a right answer 3s in earns 1,800", a1.correct && a1.points === 1800, JSON.stringify(a1));
check("only the first answer counts", G.answer(g, host, { index: 0, choice: 0 }, open + 4000).error === "answered");
check("the board waits for everyone", g.phase === "question");
v = G.view(g, laylo, open + 3000);
check("others see that someone has answered, not what", v.players.find((p) => p.pid === host).answered === true &&
  !("given" in v.players[0]));
const a2 = G.answer(g, laylo, { index: 0, choice: 0 }, open + 5000);
check("a wrong answer earns 0", a2.correct === false && a2.points === 0);
check("once everyone has answered, the answer shows at once", g.phase === "reveal");
v = G.view(g, laylo, open + 5000);
check("with the right answer and the explanation", v.solution.answer === 1 && v.solution.explain === "Because.");
check("and each player's own result", v.mine.correct === false && v.mine.points === 0);
check("and how the room split, as Kahoot shows it", v.solution.tally.options.join() === "1,1" && v.solution.tally.answered === 2);
check("counts only, never who chose what", !JSON.stringify(v.solution.tally).includes("p1"));
check("the scoreboard leads with the leader", v.players[0].pid === host && v.players[0].score === 1800 && v.players[0].place === 1);

const scoreboardEnds = g.revealEndsAt;
check("the clock moves on after the scoreboard", G.tick(g, scoreboardEnds) && g.phase === "question" && g.index === 1);
check("and the next question opens at once — only the first has a get-ready", g.opensAt === scoreboardEnds);
const deadline = g.endsAt;
check("nothing happens before time is up", !G.tick(g, deadline) && g.phase === "question");
const late = G.answer(g, host, { index: 1, choice: 1 }, deadline + 500);
check("an answer just past the deadline still counts, at the plain rate", late.points === 1000);
check("time up with someone silent: the answer shows anyway", G.tick(g, deadline + G.GRACE_MS) && g.phase === "reveal");
check("silence scores nothing", G.view(g, laylo, deadline).mine === null && g.players[laylo].gained === 0);
check("an answer to an old question is ignored", G.answer(g, laylo, { index: 0, choice: 1 }, deadline + 2000).error === "not-now");

G.tick(g, g.revealEndsAt);
G.disconnect(g, laylo, g.opensAt);
check("someone dropping out does not hold the others up",
  G.answer(g, host, { index: 2, choice: 1 }, g.opensAt + 1000).ok && g.phase === "reveal");
check("after the last question comes the final board", G.tick(g, g.revealEndsAt) && g.phase === "final");
check("the dropped player keeps their place on it", G.view(g, host, g.touchedAt).players.length === 2);
const back = G.join(g, { clientId: id(2), name: "Laylo" }, g.touchedAt);
check("and can come back as themselves", back.pid === laylo && g.players[laylo].connected);

console.log("\nanother round");
check("a guest cannot start one", G.newRound(g, laylo, forGame.slice(3, 6), g.touchedAt).error === "not-host");
check("the host can, with fresh questions", G.newRound(g, host, forGame.slice(3, 6), g.touchedAt).ok &&
  g.phase === "lobby" && g.round === 2 && g.questions[0].id === forGame[3].id);
check("everyone starts again from zero", Object.values(g.players).every((p) => p.score === 0));
check("and new people can join between rounds", G.join(g, { clientId: id(5), name: "Dilnoza" }, g.touchedAt).pid);

console.log("\nthe host");
let h = makeGame();
const c = G.join(h, { clientId: id(1), name: "Aziz", creatorToken: "tok" }, T0).pid;
const p2 = G.join(h, { clientId: id(2), name: "Laylo" }, T0 + 1).pid;
G.join(h, { clientId: id(3), name: "Bek" }, T0 + 2);
G.disconnect(h, c, T0 + 3);
check("with the creator gone, the longest here hosts", G.hostOf(h) === p2);
G.join(h, { clientId: id(1), name: "Aziz" }, T0 + 4);
check("and hands it back when they return", G.hostOf(h) === c);

console.log("\ntyped answers");
let t = makeGame(forGame.slice(40, 41), { seconds: 30, qtype: "gap", count: 5, tags: [] });
const t1 = G.join(t, { clientId: id(1), name: "Aziz", creatorToken: "tok" }, T0).pid;
const t2 = G.join(t, { clientId: id(2), name: "Laylo" }, T0).pid;
G.start(t, t1, T0);
const typed = G.answer(t, t1, { index: 0, text: "Niacin" }, t.opensAt);
check("graded as the app grades them", typed.correct && typed.points === 3000);
check("an empty answer is not an answer", G.answer(t, t2, { index: 0, text: "  " }, t.opensAt).error === "bad-answer");
G.answer(t, t2, { index: 0, text: "b12" }, t.opensAt + 1000);
check("the right answer is shown after", G.view(t, t2, t.opensAt).solution.answer === "B3");
check("with how many got a typed one right", G.view(t, t2, t.opensAt).solution.tally.right === 1 &&
  G.view(t, t2, t.opensAt).solution.tally.answered === 2);
check("a one-question game ends after it", G.tick(t, t.revealEndsAt) && t.phase === "final");

console.log("\nlimits");
let big = makeGame();
for (let i = 1; i <= L.MAX_PLAYERS; i++) G.join(big, { clientId: id(i), name: `P${i}` }, T0);
check("fifty players fit", Object.keys(big.players).length === 50);
check("the fifty-first is told it is full", G.join(big, { clientId: id(51), name: "Late" }, T0).error === "full");
let idle = makeGame();
check("a lobby left alone is closed after half an hour", G.tick(idle, T0 + G.IDLE_MS) && idle.phase === "closed");
check("a closed game cannot be joined", G.join(idle, { clientId: id(1), name: "A" }, T0).error === "missing");
let empty = makeGame();
const e1 = G.join(empty, { clientId: id(1), name: "A", creatorToken: "tok" }, T0).pid;
const e2 = G.join(empty, { clientId: id(2), name: "B" }, T0).pid;
G.start(empty, e1, T0);
G.disconnect(empty, e1, T0 + 1);
G.disconnect(empty, e2, T0 + 1);
G.tick(empty, empty.endsAt + G.GRACE_MS);
G.tick(empty, empty.revealEndsAt);
check("a game everyone has left ends instead of playing on", empty.phase === "final");

/* ── the room, through a stand-in for Cloudflare ───────────────────────── */
console.log("\nthe room");

function fakeState() {
  const store = new Map();
  const sockets = [];
  return {
    store, sockets, alarmAt: null,
    storage: {
      async get(k) { return store.has(k) ? structuredClone(store.get(k)) : undefined; },
      async put(k, v) { store.set(k, structuredClone(v)); },
      async deleteAll() { store.clear(); },
      async setAlarm(t) { this.owner.alarmAt = t; },
      async deleteAlarm() { this.owner.alarmAt = null; },
    },
    acceptWebSocket(ws) { sockets.push(ws); },
    getWebSockets() { return sockets.filter((s) => !s.closed); },
  };
}
function fakeSocket() {
  let att = null;
  return {
    sent: [], closed: false,
    send(s) { if (this.closed) throw new Error("closed"); this.sent.push(JSON.parse(s)); },
    close() { this.closed = true; },
    serializeAttachment(a) { att = structuredClone(a); },
    deserializeAttachment() { return att; },
    last() { return this.sent[this.sent.length - 1]; },
  };
}
/** A namespace of rooms, as env.GAMES. A room's memory can be wiped to act out hibernation. */
function fakeNamespace(env) {
  const rooms = new Map();
  return {
    rooms,
    idFromName: (name) => name,
    get(name) {
      if (!rooms.has(name)) {
        const state = fakeState();
        state.storage.owner = state;
        rooms.set(name, { state, room: new R.GameRoom(state, env) });
      }
      const { room } = rooms.get(name);
      return { fetch: (url, init) => room.fetch(new Request(url, init)) };
    },
  };
}

const TOKEN = "123456789:TEST-token-that-is-not-real";
const env = { BOT_TOKEN: TOKEN };
env.GAMES = fakeNamespace(env);
const create = (body) => W.handleCreate(new Request("https://w/game/create", { method: "POST", body: JSON.stringify(body) }), env);

const made = await create({ settings: { seconds: 10, qtype: "binary", count: 5, tags: ["cardio"] }, questions: forGame.slice(0, 2) });
check("a game is created with a code and the creator's token", made.status === 200 && /^\d{6}$/.test(made.body.code) &&
  made.body.creatorToken.length === 32);
check("rubbish is refused", (await create({ settings: { seconds: 10, qtype: "binary", count: 5 }, questions: [{ q: "?" }] })).status === 400);
check("without the rooms set up, it says so", (await W.handleCreate(new Request("https://w/game/create", { method: "POST", body: "{}" }), {})).status === 503);

const { room, state } = env.GAMES.rooms.get(made.body.code);
const busy = await room.fetch(new Request("https://room/init", { method: "POST", body: "{}" }));
check("a room with a game in it refuses another", busy.status === 409);

const aziz = { id: 70001, first_name: "Azizbek", last_name: "Muxtorov", username: "azizbek_muxtorov" };
const initData = await T.signInitData({ user: JSON.stringify(aziz), auth_date: String(Math.floor(Date.now() / 1000)) }, TOKEN);
const ws1 = fakeSocket(), ws2 = fakeSocket(), ws3 = fakeSocket();
state.acceptWebSocket(ws1); state.acceptWebSocket(ws2); state.acceptWebSocket(ws3);
const say = (ws, msg) => room.webSocketMessage(ws, JSON.stringify(msg));

await say(ws1, { type: "join", clientId: id(1), initData, creatorToken: made.body.creatorToken });
check("a Telegram player is named from Telegram", ws1.last().players[0].name === "Azizbek Muxtorov" &&
  ws1.last().players[0].username === "azizbek_muxtorov");
await say(ws2, { type: "join", clientId: id(2), nickname: "Laylo‮" });
check("a web player by the name they typed, cleaned", ws2.last().players[1].name === "Laylo" && ws2.last().players[1].username === null);
check("everyone hears about a newcomer", ws1.last().players.length === 2);
check("a forged Telegram name does not get through",
  (await (async () => { await say(ws3, { type: "join", clientId: id(3), initData: initData.replace("Azizbek", "Azizbeq") }); return ws3.last(); })())
    .players.find((p) => p.pid === ws3.deserializeAttachment().pid).name === "Player");
await say(ws3, { type: "leave" });
check("leaving closes the phone's connection", ws3.closed);

await say(ws2, { type: "start" });
check("a guest is told they cannot start", ws2.last().type === "notice" && ws2.last().reason === "not-host");
await say(ws1, { type: "start" });
check("the host starts it for everyone", ws1.last().phase === "question" && ws2.last().phase === "question");
check("and the room wakes itself when time is up", state.alarmAt === ws1.last().endsAt + G.GRACE_MS);

// Hibernation: the room forgets everything in memory between messages.
room.game = undefined;
const q0 = await state.storage.get("game");
const right = q0.questions[0].answer;
// Answering needs the question to be open; the clock here is real, so wind the stored game back.
q0.opensAt = Date.now() - 1000; q0.endsAt = Date.now() + 9000;
await state.storage.put("game", q0);
await say(ws1, { type: "answer", index: 0, choice: right });
check("after waking from storage it carries on", ws1.last().players.find((p) => p.pid === "p1").answered === true);
await say(ws2, { type: "answer", index: 0, choice: 1 - right });
check("the last answer reveals it to everyone", ws1.last().phase === "reveal" && ws2.last().phase === "reveal");
check("the fast right answer leads", ws2.last().players[0].name === "Azizbek Muxtorov" && ws2.last().players[0].score > 1000);

const stored = await state.storage.get("game");
stored.revealEndsAt = Date.now() - 1;
await state.storage.put("game", stored);
room.game = undefined;
await room.alarm();
check("the alarm moves everyone to the next question", ws1.last().phase === "question" && ws1.last().index === 1);

await room.webSocketClose(ws2);
check("a dropped phone shows as away", ws1.last().players.find((p) => p.pid === "p2").connected === false);
const ws2b = fakeSocket(); state.acceptWebSocket(ws2b);
await say(ws2b, { type: "join", clientId: id(2), nickname: "Laylo" });
check("and is back, same seat, on reconnecting", ws2b.last().you === "p2" && ws2b.last().phase === "question");

const stranger = fakeSocket(); state.acceptWebSocket(stranger);
await say(stranger, { type: "join", clientId: id(8), nickname: "Late" });
check("a stranger mid-game is told it has started", stranger.last().type === "error" && stranger.last().reason === "started" && stranger.closed);

const nowhere = env.GAMES.get("999999");
const { room: emptyRoom, state: emptyState } = env.GAMES.rooms.get("999999");
const lost = fakeSocket(); emptyState.acceptWebSocket(lost);
await emptyRoom.webSocketMessage(lost, JSON.stringify({ type: "join", clientId: id(1), nickname: "A" }));
check("a code with no game says so", lost.last().reason === "missing" && lost.closed && nowhere);

const closing = await state.storage.get("game");
closing.phase = "final"; closing.touchedAt = Date.now() - G.IDLE_MS - 1;
await state.storage.put("game", closing);
room.game = undefined;
await room.alarm();
check("an abandoned game is wiped", state.store.size === 0 && ws1.closed);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

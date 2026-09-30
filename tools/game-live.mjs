// The multiplayer game, live: three phones play a whole game against a
// running server — the deployed one by default, or `wrangler dev` with
// BASE=http://localhost:8787. Unlike game.test.mjs this exercises the real
// Cloudflare runtime: Durable Objects, alarms, hibernation, WebSockets. Run
// it after deploying the Worker:
//
//   node tools/game-live.mjs
//
// It needs public/questions.json (npm run compile) and takes about half a
// minute. It creates real games on the server; they close by themselves.

import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "https://usmleengo-rating.azizbekmuxtorlapt.workers.dev";
const bank = JSON.parse(readFileSync(new URL("../public/questions.json", import.meta.url), "utf8"));
const { pickGameQuestions } = await import(new URL("../src/lib/game.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const settings = { qtype: "mixed", count: 5, seconds: 10, systems: ["cardiovascular"] };
const questions = pickGameQuestions(bank, settings).slice(0, 3);
const res = await fetch(`${BASE}/game/create`, { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ settings, questions }) });
const { code, creatorToken } = await res.json();
check("created", res.ok && /^\d{6}$/.test(code), JSON.stringify({ code }));

function phone(name, clientId, token) {
  const p = { name, states: [], errors: [], last: null };
  p.ws = new WebSocket(`${BASE.replace("http", "ws")}/game/${code}/ws`);
  p.ready = new Promise((resolve) => {
    p.ws.onopen = () => {
      p.ws.send(JSON.stringify({ type: "join", clientId, nickname: name, creatorToken: token }));
      resolve();
    };
  });
  p.ws.onmessage = (e) => {
    if (e.data === "pong") { p.pong = true; return; }
    const m = JSON.parse(e.data);
    if (m.type === "state") { p.states.push(m); p.last = m; } else p.errors.push(m);
  };
  p.send = (m) => p.ws.send(JSON.stringify(m));
  p.until = async (pred, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (p.last && pred(p.last)) return p.last; await sleep(50); }
    throw new Error(`${name}: timed out; last phase ${p.last?.phase} index ${p.last?.index}`);
  };
  return p;
}

const A = phone("Aziz", "aziz-client-0000000001", creatorToken);
await A.ready; await A.until((s) => s.players.length === 1);
const B = phone("Laylo", "laylo-client-000000001");
const C = phone("Bek", "bek-client-00000000001");
await Promise.all([B.ready, C.ready]);
await A.until((s) => s.players.length === 3);
check("three in the lobby, the creator hosting", A.last.host === A.last.you && A.last.players.length === 3);

B.send({ type: "start" });
await sleep(300);
check("a guest cannot start", B.errors.some((e) => e.reason === "not-host"));

A.ws.send("ping"); await sleep(300);
check("ping is answered (auto-response)", A.pong === true);

A.send({ type: "start" });
const q0 = await A.until((s) => s.phase === "question" && s.index === 0);
check("the question arrives without its answer", !("solution" in q0) && q0.question && !JSON.stringify(q0.question).includes("accept"));
const wait = q0.opensAt - q0.now;
check("with a 3-second get-ready", wait > 2000 && wait <= 3000, `${wait}`);

const answerFor = (s, right) => {
  const q = questions.find((x) => x.q === s.question.q && (x.img || null) === s.question.img);
  if (s.question.type === "binary") {
    const correctText = q.options[q.answer];
    const idx = s.question.options.indexOf(correctText);
    return { choice: right ? idx : 1 - idx };
  }
  return { text: right ? q.accept[0] : "zzz wrong" };
};

for (let i = 0; i < 3; i++) {
  const s = await A.until((x) => x.phase === "question" && x.index === i);
  // Fast, but not a reflex: an answer faster than the question can be read earns nothing.
  await sleep(Math.max(0, s.opensAt - s.now) + 3500);
  A.send({ type: "answer", index: i, ...answerFor(s, true) });   // fast and right
  await sleep(1500);
  if (i === 0) {
    B.send({ type: "answer", index: i, ...answerFor(s, true) }); // slower and right
    C.send({ type: "answer", index: i, ...answerFor(s, false) }); // wrong
    // Under the 10 s timer, so a reveal here can only come from everyone answering;
    // the slack is for a room just woken after a deploy.
    const r = await A.until((x) => x.phase === "reveal" && x.index === 0, 8000);
    check("everyone answered: revealed at once", Boolean(r));
    const pts = Object.fromEntries(r.players.map((p) => [p.name, p.gained]));
    check("fast right beats slow right beats wrong", pts.Aziz > pts.Laylo && pts.Laylo > 0 && pts.Bek === 0, JSON.stringify(pts));
    check("the reveal carries the answer", r.solution && r.solution.answer !== undefined);
    check("and how many chose what", r.solution.tally && r.solution.tally.answered === 3);
    check("each phone its own verdict", B.last.mine?.correct === true && C.last.mine?.correct === false);
  } else if (i === 1) {
    // Bek drops out mid-question; Laylo stays silent: the alarm must end it.
    C.ws.close();
    const r = await A.until((x) => x.phase === "reveal" && x.index === 1, 15000);
    check("silence: the alarm reveals when time is up", Boolean(r));
    check("the dropped player shows as away", r.players.find((p) => p.name === "Bek").connected === false);
  } else {
    B.send({ type: "answer", index: i, ...answerFor(s, true) });
  }
}

const fin = await A.until((s) => s.phase === "final", 15000);
check("after the last reveal, the final board", fin.players[0].name === "Aziz" && fin.players[0].place === 1);
const late = phone("Late", "late-client-0000000001");
await late.ready; await sleep(500);
check("a stranger cannot join a finished game", late.errors.some((e) => e.reason === "started"));

const C2 = phone("Bek", "bek-client-00000000001");
await C2.ready;
const back = await C2.until((s) => s.phase === "final");
check("the dropped player comes back to the same seat", back.you === fin.players.find((p) => p.name === "Bek").pid);

B.send({ type: "again", questions: pickGameQuestions(bank, settings) });
await sleep(400);
check("a guest cannot start a new round", B.errors.some((e) => e.reason === "not-host"));
A.send({ type: "again", questions: pickGameQuestions(bank, settings) });
const lobby = await A.until((s) => s.phase === "lobby" && s.round === 2);
check("the host starts round two, back in the lobby", lobby.players.every((p) => p.score === 0) && lobby.total === 5);
const late2 = phone("Late", "late-client-0000000001");
await late2.ready;
await A.until((s) => s.players.some((p) => p.name === "Late"));
check("and a newcomer can join between rounds", true);

A.send({ type: "leave" });
const handed = await B.until((s) => s.phase === "lobby" && !s.players.some((p) => p.name === "Aziz"));
// Laylo and Bek connect at the same moment, so either may have joined first.
const earliest = handed.players.filter((p) => p.connected).sort((a, b) => Number(a.pid.slice(1)) - Number(b.pid.slice(1)))[0];
check("the host leaving the lobby hands over to the longest here", handed.host === earliest.pid,
  JSON.stringify({ host: handed.host, players: handed.players.map((p) => [p.pid, p.name, p.connected]) }));

const bad = await fetch(`${BASE}/game/create`, { method: "POST", body: JSON.stringify({ settings, questions: [{ q: "x" }] }) });
check("bad questions refused", bad.status === 400);

for (const p of [B, C2, late, late2]) try { p.ws.close(); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

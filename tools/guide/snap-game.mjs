// Real game states, from the server's own rules, played with real bank questions.
import fs from "node:fs";
const G = await import(new URL("worker/src/game.js", new URL("../../", import.meta.url)).href);
const L0 = await import(new URL("src/lib/game.js", new URL("../../", import.meta.url)).href);
const bank = JSON.parse(fs.readFileSync(new URL("public/questions.json", new URL("../../", import.meta.url)), "utf8"));
const uz = JSON.parse(fs.readFileSync(new URL("public/questions.uz.json", new URL("../../", import.meta.url)), "utf8"));
const L = Array.isArray(bank) ? bank : bank.questions;
const nice = L.filter((q) => q.type === "binary" && !q.img && q.q.length > 40 && q.q.length < 95 && q.options.every((o) => o.length < 34) && (q.explain || "").length > 40 && (q.explain || "").length < 200 && uz[q.id]?.q && uz[q.id].q.length < 110 && uz[q.id].o.every((o) => o.length < 36));
let pick = [nice[3], nice[40], nice[77], nice[120]].map((q) => L0.forGame({ ...q, uzt: uz[q.id] }));
const out = {};
for (const lang of ["en", "uz"]) {
  let now = 1_000_000;
  let seed = 11; const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const game = G.newGame({ code: "482193", settings: { count: 4, seconds: 20, qtype: "binary" }, questions: G.cleanQuestions(pick), creatorToken: "tok", now, random });
  const me = G.join(game, { clientId: "client-aaaaaaaaaaaa", name: "Madina", creatorToken: "tok", lang }, now).pid;
  const pj = G.join(game, { clientId: "client-bbbbbbbbbbbb", name: "Jasur", username: "jasur_md", lang }, now).pid;
  const ps = G.join(game, { clientId: "client-cccccccccccc", name: "Sardor", lang }, now).pid;
  const pn = G.join(game, { clientId: "client-dddddddddddd", name: "Nilufar", username: "nilufar", lang }, now).pid;
  const snaps = {};
  const snap = (k, pid = me) => { snaps[k] = JSON.parse(JSON.stringify(G.view(game, pid, now))); };
  const right = () => game.questions[game.index].answer;
  const wrong = () => 1 - right();
  snap("lobby");
  G.start(game, me, now); now += 3100; G.tick(game, now);
  now += 2600; snap("q1");
  G.answer(game, me, { index: game.index, choice: right() }, now);
  G.answer(game, pj, { index: game.index, choice: wrong() }, now + 900);
  G.answer(game, ps, { index: game.index, choice: right() }, now + 4200);
  snap("answered");
  G.answer(game, pn, { index: game.index, choice: right() }, now + 7000);
  now += 7100; G.tick(game, now);
  snap("reveal1");
  for (let q = 2; q <= 3; q++) {
    now += 7100; G.tick(game, now); now += 3100; G.tick(game, now);
    now += 2200;
    G.answer(game, me, { index: game.index, choice: right() }, now);
    G.answer(game, pj, { index: game.index, choice: right() }, now + 1800);
    G.answer(game, ps, { index: game.index, choice: wrong() }, now + 5000);
    G.answer(game, pn, { index: game.index, choice: right() }, now + 6500);
    now += 6600; G.tick(game, now);
    if (q === 3) snap("reveal3");
  }
  now += 7100; G.tick(game, now); now += 3100; G.tick(game, now);
  now += 3000; G.answer(game, me, { index: game.index, choice: wrong() }, now);
  G.answer(game, pj, { index: game.index, choice: right() }, now + 600); G.answer(game, ps, { index: game.index, choice: right() }, now + 900); G.answer(game, pn, { index: game.index, choice: right() }, now + 1300);
  now += 1400; G.tick(game, now);
  now += 7100; G.tick(game, now);
  snap("final");
  out[lang] = snaps;
}
fs.writeFileSync("game-snaps.json", JSON.stringify(out));
for (const lang of ["en", "uz"]) for (const [k, v] of Object.entries(out[lang])) console.log(lang, k, v.phase, v.players.map((p) => `${p.name}:${p.score}/${p.streak}`).join(" "), v.question?.q?.slice(0, 40) || "");

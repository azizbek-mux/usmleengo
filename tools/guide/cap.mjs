// Captures every screen of the guide, in one language, with the on-screen
// position of the parts each page points at. node cap.mjs <en|uz> [screen,screen]
import fs from "node:fs";
import { launch, phone, sleep, clickText } from "./lib.mjs";
import { mocks } from "./mocks.mjs";

const lang = process.argv[2] || "en";
const only = process.argv[3] ? new Set(process.argv[3].split(",")) : null;
const demo = JSON.parse(fs.readFileSync("demo-state.json", "utf8"));
const out = `shots/${lang}`;
fs.mkdirSync(out, { recursive: true });
const meta = fs.existsSync(`${out}/meta.json`) ? JSON.parse(fs.readFileSync(`${out}/meta.json`, "utf8")) : {};

const b = await launch();
const BASE_STATE = { ...demo, lang, theme: "dark", section: "quiz", qtype: "binary", count: 10, systems: [], subjects: [] };
const open = (over = {}, opts = {}) => phone(b, { state: { ...BASE_STATE, ...over }, init: mocks(lang), ...opts });
const tab = (p, re) => clickText(p, re, ".tab-btn");
const rectOf = (p, spec) => p.evaluate((spec) => {
  const els = [...document.querySelectorAll(spec.sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const re = spec.text ? new RegExp(spec.text, "i") : null;
  const hit = els.filter((e) => !re || re.test(e.textContent.trim()));
  if (spec.all) {
    // only what is really visible: clipped by any scrolling or hidden-overflow ancestor
    const clip = (e) => {
      let r = e.getBoundingClientRect();
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a);
        if (/(auto|scroll|hidden|clip)/.test(o.overflowY + o.overflowX)) {
          const b = a.getBoundingClientRect();
          r = { left: Math.max(r.left, b.left), right: Math.min(r.right, b.right), top: Math.max(r.top, b.top), bottom: Math.min(r.bottom, b.bottom) };
        }
      }
      return r.right > r.left && r.bottom > r.top ? r : null;
    };
    const rs = hit.map(clip).filter((r) => r && r.bottom > 0 && r.top < innerHeight);
    if (!rs.length) return null;
    const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.max(0, Math.min(...rs.map((r) => r.top)));
    const x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.min(innerHeight, Math.max(...rs.map((r) => r.bottom)));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const el = hit[spec.nth || 0];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}, spec);

async function snap(p, name, marks = {}) {
  await sleep(350);
  const rects = {};
  for (const [id, spec] of Object.entries(marks)) {
    const r = await rectOf(p, spec);
    if (!r) console.log(`  !! ${name}: no ${id}`);
    else rects[id] = r;
  }
  await p.screenshot({ path: `${out}/${name}.png` });
  meta[name] = { marks: rects };
  fs.writeFileSync(`${out}/meta.json`, JSON.stringify(meta, null, 1));
  console.log(`  ${name} (${Object.keys(rects).length}/${Object.keys(marks).length} marks)`);
}

// The right option of the question on screen, from the bank itself.
const rightText = (p) => p.evaluate(async () => {
  const bank = await (await fetch("/questions.json")).json();
  const L = Array.isArray(bank) ? bank : bank.questions;
  const uzAll = window.__lang === "uz" ? await (await fetch("/questions.uz.json")).json() : null;
  const qt = document.querySelector(".q-text")?.textContent.trim();
  const opts = [...document.querySelectorAll(".opt")].map((o) => o.textContent.trim());
  for (const q of L) {
    if (q.type !== "binary") continue;
    const en = q.options[q.answer];
    const uz = uzAll?.[q.id]?.o?.[q.answer];
    if (opts.includes(en)) { if (!qt || q.q.startsWith(qt.slice(0, 30)) || (uzAll && uzAll[q.id]?.q?.startsWith(qt.slice(0, 30)))) return en; }
    if (uz && opts.includes(uz) && uzAll[q.id]?.q?.startsWith(qt.slice(0, 30))) return uz;
  }
  return null;
});
const tapOption = async (p, text) => p.evaluate((text) => { const o = [...document.querySelectorAll(".opt")].find((x) => x.textContent.trim() === text); o?.click(); return !!o; }, text);
const wrongOption = async (p) => { const right = await rightText(p); return p.evaluate((right) => [...document.querySelectorAll(".opt")].map((o) => o.textContent.trim()).find((x) => x !== right), right); };

const HOME_MARKS = {
  streak: { sel: ".streak-pill" },
  search: { sel: ".search" },
  flask: { sel: ".lab-btn" },
  mistakes: { sel: "button", text: "Mistakes|Xatolar" },
  saved: { sel: "button", text: "Saved|Saqlangan" },
  weak: { sel: "button", text: "Weak topics|Zaif mavzular" },
  systems: { sel: ".section-label, .cat-title, .chips-head", text: "Systems|Tizimlar" },
  count: { sel: "button", text: "question|savol", nth: 0 },
  type: { sel: "button", text: "^(Mixed|Multiple choice only|Fill the gap only|Aralash|Test|Yozma)$" },
  start: { sel: ".btn-primary" },
  tabs: { sel: ".tabbar, nav, .tabs" },
  tab0: { sel: ".tab-btn", nth: 0 }, tab1: { sel: ".tab-btn", nth: 1 }, tab2: { sel: ".tab-btn", nth: 2 },
  tab3: { sel: ".tab-btn", nth: 3 }, tab4: { sel: ".tab-btn", nth: 4 }, tab5: { sel: ".tab-btn", nth: 5 },
  rows: { sel: ".cat-row", all: true },
  review: { sel: ".review-tile", all: true },
};
const QUIZ_MARKS = {
  close: { sel: ".close" },
  bar: { sel: ".bar" },
  flask: { sel: ".save-btn", nth: 0 },
  bookmark: { sel: ".save-btn", nth: 1 },
  question: { sel: ".q-text" },
  optA: { sel: ".opt", nth: 0 },
  optB: { sel: ".opt", nth: 1 },
};

const gapAnswer = (p) => p.evaluate(async () => {
  const bank = await (await fetch("/questions.json")).json();
  const uzAll = window.__lang === "uz" ? await (await fetch("/questions.uz.json")).json() : null;
  const L = Array.isArray(bank) ? bank : bank.questions;
  const norm = (x) => x.replace(/_{2,}/g, "?").replace(/\s+/g, "").toLowerCase();
  const on = norm((document.querySelector(".q-text") || document.querySelector(".q-gap") || document.querySelector(".screen")).textContent);
  for (const q of L) {
    if (q.type !== "gap") continue;
    const text = uzAll ? uzAll[q.id]?.q : q.q;
    if (text && on.includes(norm(text).slice(0, 28))) return uzAll ? uzAll[q.id].a : q.answer;
  }
  return null;
});
const finishQuiz = async (p, wrongAt = []) => {
  for (let i = 0; i < 5; i++) {
    await sleep(3200 + i * 500);          // a person reads first: the clock is real
    const right = await rightText(p);
    const text = wrongAt.includes(i) ? await wrongOption(p) : right;
    await tapOption(p, text); await sleep(500);
    await clickText(p, /^(Continue|Davom|See results|Natijalarni|Natijani)/i);
    await sleep(600);
  }
};

const screens = {
  async home() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await snap(p, "home", HOME_MARKS);
    // the lower half: subjects, the count and type choosers, Random
    await p.evaluate(() => { const s = document.querySelector(".screen"); (s.scrollTo ? s : window).scrollTo(0, 99999); window.scrollTo(0, 99999); });
    await snap(p, "home-lower", HOME_MARKS);
    await p.close();
  },
  async quiz() {
    const p = await open({ count: 5 });
    await sleep(3200);
    await clickText(p, /^(Random|Tasodifiy)/); await sleep(1200);
    await snap(p, "quiz-question", QUIZ_MARKS);
    const right = await rightText(p);
    await tapOption(p, right); await sleep(900);
    await snap(p, "quiz-right", { ...QUIZ_MARKS, topic: { sel: ".q-topic" }, feedback: { sel: ".feedback" }, report: { sel: ".fb-report" }, cont: { sel: ".btn-primary" } });
    await p.close();
    // a wrong answer
    const w = await open({ count: 5 });
    await sleep(3200);
    await clickText(w, /^(Random|Tasodifiy)/); await sleep(1200);
    const bad = await wrongOption(w);
    await tapOption(w, bad); await sleep(900);
    await snap(w, "quiz-wrong", { ...QUIZ_MARKS, feedback: { sel: ".feedback" }, report: { sel: ".fb-report" }, cont: { sel: ".btn-primary" }, correct: { sel: ".opt.correct" }, mine: { sel: ".opt.wrong" } });
    await w.close();
  },
  async typed() {
    const p = await open({ qtype: "gap", count: 5 });
    await sleep(3200);
    await clickText(p, /^(Random|Tasodifiy)/); await sleep(1200);
    await snap(p, "typed-question", { close: { sel: ".close" }, bar: { sel: ".bar" }, input: { sel: ".gap-input" }, blank: { sel: ".gap" }, check: { sel: ".btn-primary" } });
    const ans = await gapAnswer(p);
    console.log("  answer:", ans);
    if (ans) { await p.type(".gap-input", ans, { delay: 15 }); await sleep(300); }
    await snap(p, "typed-filled", { input: { sel: ".gap-input" }, check: { sel: ".btn-primary" } });
    await clickText(p, /^(Check|Tekshirish)/); await sleep(900);
    await snap(p, "typed-right", { feedback: { sel: ".feedback" }, cont: { sel: ".btn-primary" } });
    await p.close();
  },
  async picture() {
    const p = await open({ saved: ["erythema-nodosum-0mnwuhu", "ehrlichiosis-1bwld6i", "histoplasmosis-0b8xa8s"] });
    await sleep(3200);
    await clickText(p, /^(Saved|Saqlangan)/); await sleep(1500);
    await snap(p, "picture-question", { close: QUIZ_MARKS.close, bar: QUIZ_MARKS.bar, flask: QUIZ_MARKS.flask, bookmark: QUIZ_MARKS.bookmark, optA: QUIZ_MARKS.optA, optB: QUIZ_MARKS.optB, image: { sel: ".q-img" }, hint: { sel: ".q-img-hint" } });
    await p.evaluate(() => document.querySelector(".q-img").click()); await sleep(700);
    await snap(p, "picture-zoom", { zoom: { sel: ".zoom, [class*=zoom]" } });
    await p.close();
  },
  async result() {
    const p = await open({ count: 5 });
    await sleep(3200);
    await clickText(p, /^(Random|Tasodifiy)/); await sleep(1200);
    await finishQuiz(p, [2]);
    await sleep(800);
    console.log(await p.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 400)));
    await snap(p, "result", { ring: { sel: "svg", nth: 0 }, title: { sel: "h1, h2, .result-t", nth: 0 }, bar: { sel: ".result-bar, .split-bar, .bar", nth: 0 }, tiles: { sel: ".rewards, .reward-row, .reward", nth: 0 }, points: { sel: ".reward", nth: 0 }, score: { sel: ".reward", nth: 1 }, streak: { sel: ".reward", nth: 2 }, missed: { sel: ".review" }, again: { sel: ".btn-primary" }, share: { sel: ".btn-ghost" } });
    await p.close();
  },
  async english() {
    const p = await open({ section: "english" });
    await sleep(3200);
    await tab(p, /^(English|Ingliz tili)$/); await sleep(1200);
    await snap(p, "english-setup", { input: { sel: ".num-hero-input" }, start: { sel: ".btn-primary" } });
    await p.evaluate(() => document.querySelector(".btn-primary").click()); await sleep(1500);
    console.log(await p.evaluate(() => document.querySelector(".screen").innerText.replace(/\n+/g, " | ").slice(0, 500)));
    console.log(await p.evaluate(() => [...document.querySelectorAll(".screen button, .screen [class*=deck]")].map((e) => `${e.tagName}.${(e.className||"").toString().replace(/\s+/g,".")}:${(e.textContent||"").trim().slice(0,28)}`).join("\n")));
    await snap(p, "english-deck", { stats: { sel: ".deck-stats" }, gear: { sel: ".gear" }, search: { sel: ".search" }, bar: { sel: ".deck-bar" }, study: { sel: ".btn-primary" } });
    await p.evaluate(() => document.querySelector(".btn-primary").click()); await sleep(1200);
    console.log(await p.evaluate(() => [...document.querySelectorAll("button, [class*=card], [class*=flash]")].map((e) => `${e.tagName}.${(e.className||"").toString().replace(/\s+/g,".")}:${(e.textContent||"").trim().slice(0,30)}`).join(" ; ")));
    await snap(p, "english-front", { close: { sel: ".close" }, face: { sel: ".card-front" }, tags: { sel: ".card-tags" }, term: { sel: ".card-term" }, ipa: { sel: ".card-ipa" }, hint: { sel: ".card-hint" }, show: { sel: ".btn-primary" } });
    await p.evaluate(() => document.querySelector(".btn-primary").click()); await sleep(900);
    console.log(await p.evaluate(() => [...document.querySelectorAll("button, .card-back, [class*=grade], [class*=rate]")].map((e) => `${e.tagName}.${(e.className||"").toString().replace(/\s+/g,".")}:${(e.textContent||"").trim().slice(0,30)}`).join(" ; ")));
    await snap(p, "english-back", { face: { sel: ".card-back" }, rates: { sel: ".rate-row" }, again: { sel: ".rate.again" }, hard: { sel: ".rate.hard" }, good: { sel: ".rate.good" }, easy: { sel: ".rate.easy" } });
    await p.close();
  },
  async play() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await tab(p, /^(Play|O'yin)$/); await sleep(1000);
    await p.type("input:not(.game-code-input)", "Madina", { delay: 20 });
    await snap(p, "play-menu", { name: { sel: ".gap-input", nth: 0 }, create: { sel: ".btn-primary" }, code: { sel: ".game-code-input" }, join: { sel: ".game-join-btn" } });
    await clickText(p, /^(Create a game|O'yin yaratish)/); await sleep(1200);
    console.log(await p.evaluate(() => document.querySelector(".screen").innerText.replace(/\n+/g, " | ").slice(0, 700)));
    await snap(p, "play-setup", { type: { sel: ".section-label", text: "Question type|Savol turi", nth: 0 }, count: { sel: ".section-label", text: "^Questions|^Savollar", nth: 0 }, secs: { sel: ".section-label", text: "Time|Vaqt", nth: 0 }, systems: { sel: ".cat-title", nth: 0 }, back: { sel: ".back-link" } });
    await p.close();
  },
  async game() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await tab(p, /^(Play|O'yin)$/); await sleep(800);
    await p.type("input:not(.game-code-input)", "Madina", { delay: 20 });
    await p.type(".game-code-input", "482193", { delay: 20 });
    await clickText(p, /^(Join|Qo'shilish)$/); await sleep(700);
    await p.evaluate(() => window.__emit("lobby")); await sleep(700);
    await snap(p, "game-lobby", { code: { sel: ".game-code-card" }, share: { sel: ".game-share" }, players: { sel: ".board" }, start: { sel: ".btn-primary", nth: 1 }, leave: { sel: ".close" }, note: { sel: ".cta-note, .game-note" } });
    await p.evaluate(() => window.__emit("q1", 2600)); await sleep(700);
    await snap(p, "game-question", { close: { sel: ".close" }, score: { sel: ".game-top-me" }, title: { sel: ".game-top-t" }, timer: { sel: ".game-timer" }, question: { sel: ".q-text" }, optA: { sel: ".opt", nth: 0 }, optB: { sel: ".opt", nth: 1 }, who: { sel: ".game-status" } });
    await p.evaluate(() => { const o = document.querySelector(".opt"); o && o.click(); }); await sleep(300);
    await p.evaluate(() => window.__emit("answered", 4000)); await sleep(600);
    await snap(p, "game-answered", { picked: { sel: ".opt.picked" }, status: { sel: ".game-status" }, timer: { sel: ".game-timer" } });
    await p.evaluate(() => window.__emit("reveal3", 0)); await sleep(800);
    await snap(p, "game-reveal", { score: { sel: ".game-top-me" }, result: { sel: ".game-result" }, streak: { sel: ".game-streak" }, lead: { sel: ".game-behind" }, tally: { sel: ".game-tally" }, explain: { sel: ".game-explain" }, board: { sel: ".board" }, me: { sel: ".board-row.me" }, gain: { sel: ".game-gain", nth: 0 } });
    await p.evaluate(() => window.__emit("final", 0)); await sleep(800);
    await snap(p, "game-final", { podium: { sel: ".game-podium" }, mine: { sel: ".game-final-me, .rating-place" }, again: { sel: ".btn-primary" }, leave: { sel: ".btn-ghost" }, board: { sel: ".board" } });
    await p.close();
  },
  async classes() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await tab(p, /^(Class|Guruh)$/); await sleep(1200);
    await snap(p, "class-home", { join: { sel: ".game-code-input" }, joinBtn: { sel: ".game-join-btn" }, learning: { sel: ".class-card", nth: 0 }, teaching: { sel: ".class-card", nth: 1 }, create: { sel: ".class-create" } });
    await clickText(p, /Step 1/, ".class-card"); await sleep(1200);
    await snap(p, "class-teacher", { code: { sel: ".game-code-card" }, share: { sel: ".game-share" }, requests: { sel: ".board", nth: 0 }, period: { sel: ".period" }, students: { sel: ".board", nth: 1 } });
    await p.evaluate(() => window.scrollTo(0, 99999)); await p.evaluate(() => { const s = document.querySelector(".screen"); s && s.scrollTo && s.scrollTo(0, 99999); }); await sleep(400);
    await snap(p, "class-teacher-lower", { packages: { sel: ".class-list", nth: 0 }, newPackage: { sel: ".class-create", nth: 0 }, homework: { sel: ".class-list", nth: 1 } });
    await p.close();
    const q = await open({ qtype: null });
    await sleep(3200);
    await tab(q, /^(Class|Guruh)$/); await sleep(1000);
    await clickText(q, /Pathology|Patologiya/, ".class-card"); await sleep(1200);
    await snap(q, "class-student", { place: { sel: ".rating-place" }, board: { sel: ".board" }, homework: { sel: ".class-list", nth: 0 }, leave: { sel: ".home-cta" } });
    await q.close();
  },
  async rating() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await tab(p, /^(Rating|Reyting)$/); await sleep(1200);
    await snap(p, "rating", { period: { sel: ".period" }, place: { sel: ".rating-place" }, filter: { sel: ".rating-filter" }, board: { sel: ".board" }, me: { sel: ".board-row.me" }, how: { sel: ".rating-how summary" } });
    await p.evaluate(() => { const d = document.querySelector(".rating-how"); d.open = true; d.scrollIntoView(); }); await sleep(500);
    await snap(p, "rating-how", { rules: { sel: ".points-rules" } });
    await p.evaluate(() => window.scrollTo(0, 0)); await p.evaluate(() => { const s = document.querySelector(".screen"); s && s.scrollTo && s.scrollTo(0, 0); });
    await clickText(p, /^(This week|Shu hafta)/); await sleep(800);
    await snap(p, "rating-week", { board: { sel: ".board" }, place: { sel: ".rating-place" } });
    await p.close();
  },
  async me() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await tab(p, /^(Me|Profil)$/); await sleep(1000);
    await snap(p, "me", { points: { sel: ".perf-points" }, how: { sel: ".rating-how summary" }, numbers: { sel: ".perf-cards, .perf-grid, .perf-card", nth: 0 } });
    await p.evaluate(() => window.scrollTo(0, 99999)); await p.evaluate(() => { const s = document.querySelector(".screen"); s && s.scrollTo && s.scrollTo(0, 99999); }); await sleep(400);
    await snap(p, "me-lower", { language: { sel: ".theme-opt", nth: 0 }, theme: { sel: ".theme-opt", nth: 2 }, reset: { sel: ".set-btn" }, tour: { sel: ".set-link", nth: 0 }, report: { sel: ".set-link", nth: 1 }, coffee: { sel: ".set-link", nth: 2 } });
    await p.close();
  },
  async search() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await p.type(".search input", lang === "uz" ? "niatsin" : "niacin", { delay: 40 }); await sleep(900);
    await snap(p, "search", { box: { sel: ".search" }, results: { sel: ".topic-list, .results, .cat-list", nth: 0 }, first: { sel: "button", text: "^(Quiz me on|«)" } });
    console.log(await p.evaluate(() => document.querySelector(".screen").innerText.replace(/\n+/g, " | ").slice(0, 300)));
    await p.close();
  },
  async select() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await clickText(p, /^Cardiovascular|^Yurak/, ".cat-row, label, button"); await sleep(400);
    console.log(await p.evaluate(() => [...document.querySelectorAll(".screen button, .screen label")].slice(0, 14).map((e) => `${e.tagName}.${(e.className||"").toString().replace(/\s+/g,".")}:${(e.textContent||"").trim().slice(0,24)}`).join("\n")));
    await snap(p, "select", { row: { sel: ".cat-row.on" }, clear: { sel: ".chips-clear" }, start: { sel: ".btn-primary" }, chosen: { sel: ".cat-title" } });
    await p.close();
  },
  async labs() {
    const p = await open();
    await sleep(3200);
    await clickText(p, /^$/, ".lab-btn"); await sleep(200);
    await p.evaluate(() => document.querySelector(".lab-btn").click()); await sleep(800);
    await snap(p, "labs", { title: { sel: ".sheet h2, .sheet-title, .sheet-head" }, search: { sel: ".lab-search" }, units: { sel: ".lab-units" }, list: { sel: ".lab-list", nth: 0 }, close: { sel: ".sheet-close, .sheet button" } });
    await p.close();
  },
  async weak() {
    const p = await open({ qtype: null });
    await sleep(3200);
    await clickText(p, /Weak topics|Zaif mavzular/); await sleep(900);
    console.log(await p.evaluate(() => document.body.innerText.replace(/\n+/g, " | ").slice(0, 600)));
    await snap(p, "weak", { period: { sel: ".period" }, list: { sel: ".weak-list" }, row: { sel: ".weak-row", nth: 0 }, back: { sel: ".back-link" } });
    await p.close();
  },
  async sheets() {
    const p = await open({ qtype: null });
    await sleep(3200);
    console.log(await p.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent.trim().slice(0, 30)).join(" | ")));
    await clickText(p, /^(10 question|10 ta savol)/); await sleep(700);
    await snap(p, "count-sheet", { sheet: { sel: ".sheet" } });
    await p.close();
    const q = await open({ qtype: null });
    await sleep(3200);
    await clickText(q, /^(Mixed|Aralash)$/); await sleep(700);
    await snap(q, "type-sheet", { sheet: { sel: ".sheet" } });
    await q.close();
  },
};

for (const [name, fn] of Object.entries(screens)) {
  if (only && !only.has(name)) continue;
  console.log(name);
  try { await fn(); } catch (e) { console.log("  FAILED", name, e.message); }
}
await b.close();

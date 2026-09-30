// What the page believes about the network and the game while a guide screen
// is captured: made-up players and a made-up class, and a game played through
// the server's own rules (game-snaps.json).
import fs from "node:fs";
const snaps = JSON.parse(fs.readFileSync(new URL("./game-snaps.json", import.meta.url), "utf8"));

const PLAYERS = [
  ["Malika Yusupova", "malika_y", 31420, 48], ["Jasur", "jasur_md", 28905, 41], ["Nilufar", "nilufar", 25130, 33], ["Sardor Aliyev", null, 22440, 27],
  ["Madina", "madina_step1", 20015, 24], ["Bekzod", "bek_usmle", 18760, 22], ["Aziza Karimova", "aziza_k", 16200, 19], ["Otabek", null, 14990, 17],
  ["Dilshod", "dilshod_mbbs", 13505, 15], ["Zarina", "zarina_z", 12980, 14],
];
const row = (i, p) => ({ place: i + 1, name: p[0], username: p[1], isMe: false, points: p[2], raw: { streak: p[3], pace: 5400 + i * 380 } });
const rating = {
  ranked: true,
  top: { overall: PLAYERS.map((p, i) => row(i, p)), streak: [...PLAYERS].sort((a, b) => b[3] - a[3]).map((p, i) => ({ ...row(i, p), place: i + 1 })) },
  me: { overall: { place: 14, total: 312 }, streak: { place: 61, total: 312 } },
  week: {
    top: [["Nilufar", "nilufar", 4120, 7], ["Jasur", "jasur_md", 3860, 7], ["Zarina", "zarina_z", 3510, 6], ["Madina", "madina_step1", 3340, 7], ["Otabek", null, 2980, 5], ["Malika Yusupova", "malika_y", 2710, 7], ["Bekzod", "bek_usmle", 2450, 5], ["Dilshod", "dilshod_mbbs", 2190, 4], ["Aziza Karimova", "aziza_k", 1840, 4], ["Sardor Aliyev", null, 1620, 3]].map((p, i) => ({ place: i + 1, name: p[0], username: p[1], isMe: false, points: p[2], raw: { streak: p[3], pace: 6000 } })),
    me: { place: 12, total: 148, points: 1310, raw: { streak: 5, pace: 6100 } },
    endsAt: Date.now() + 3 * 86400000 + 5 * 3600000,
  },
};

const weak = (a, n, pct) => ({ tag: a, answered: n, pct });
const classes = (lang) => {
  const uz = lang === "uz";
  const name = uz ? "Step 1 — 4-guruh" : "Step 1 — Group 4";
  const nameB = uz ? "Patologiya to'garagi" : "Pathology club";
  const mkn = (points, rank, extra = {}) => ({ points, rank, streak: 9, answered: 640, accuracy: 76, pace: 6200, weak: [weak("cardiovascular", 42, 88), weak("renal", 31, 54), weak("endocrine", 27, 63)], ...extra });
  const stu = [["Madina", "madina_step1", 20015], ["Jasur", "jasur_md", 28905], ["Nilufar", "nilufar", 25130], ["Bekzod", "bek_usmle", 18760], ["Zarina", "zarina_z", 12980], ["Otabek", null, 9420]]
    .sort((a, b) => b[2] - a[2]);
  const teacher = {
    role: "teacher", class: { id: "c1", name, code: "482193" }, limits: { students: 60 },
    requests: [{ player: "r1", name: "Nodira", username: "nodira_m" }],
    students: stu.map((s, i) => ({ player: `p${i}`, name: s[0], username: s[1], all: mkn(s[2], i + 1, { streak: 30 - i * 4, answered: 900 - i * 90 }), since: mkn(Math.round(s[2] / 4), i + 1) })),
    packages: [{ id: "pk1", name: uz ? "Nefrologiya asoslari" : "Renal basics", count: 40 }, { id: "pk2", name: uz ? "Farmakologiya: antibiotiklar" : "Pharmacology: antibiotics", count: 25 }],
    assignments: [{ id: "a1", title: uz ? "Haftalik topshiriq" : "Weekly homework", packageId: "pk1", dueAt: Date.now() + 3 * 86400000, done: 4 }],
  };
  const student = {
    role: "student", class: { id: "c2", name: nameB, teacherName: "Dr Aliyev", teacherUsername: "aliyev" }, students: 13,
    ranking: { top: stu.slice(0, 5).map((s, i) => ({ place: i + 1, name: s[0], username: s[1], points: s[2], isMe: s[0] === "Madina" })), me: { place: 3, total: 13, points: 20015 } },
    assignments: [{ id: "a1", title: uz ? "Haftalik topshiriq" : "Weekly homework", packageId: "pk1", dueAt: Date.now() + 2 * 86400000, mine: null }, { id: "a0", title: uz ? "Yurak-qon tomir testi" : "Cardiovascular quiz", packageId: "pk1", dueAt: Date.now() - 86400000, mine: { score: 8, total: 10, late: false } }],
    packages: [{ id: "pk1", name: uz ? "Nefrologiya asoslari" : "Renal basics", count: 40 }],
  };
  const mine = { teaching: [{ id: "c1", name, code: "482193", students: stu.length, waiting: 1 }], learning: [{ id: "c2", name: nameB, teacher_name: "Dr Aliyev", status: "active" }] };
  return { teacher, student, mine };
};

export const mocks = (lang) => `
window.__lang = ${JSON.stringify(lang)};
try { localStorage.setItem("usmle_dev_initdata", "x"); } catch {}
(() => {
  const SNAPS = ${JSON.stringify(snaps[lang])};
  const RATING = ${JSON.stringify(rating)};
  const CLS = ${JSON.stringify(classes(lang))};
  let sock = null;
  window.WebSocket = class {
    constructor(url) { this.url = url; this.readyState = 0; sock = this; setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
    send(m) { (window.__sent ||= []).push(m); }
    close() { this.readyState = 3; }
  };
  // Deliver a saved game state, its clock moved to now (and "rel" ms earlier).
  window.__emit = (k, rel = 0) => {
    const s = JSON.parse(JSON.stringify(SNAPS[k]));
    const off = Date.now() - s.now - rel;
    for (const key of ["now", "opensAt", "endsAt", "revealEndsAt"]) if (s[key]) s[key] += off;
    sock.onmessage({ data: JSON.stringify(s) });
  };
  const realFetch = window.fetch.bind(window);
  const json = (b) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("/sync")) return json(RATING);
    if (u.includes("/class/mine")) return json(CLS.mine);
    if (u.includes("/class/view")) return json(JSON.parse(opts.body).classId === "c1" ? CLS.teacher : CLS.student);
    if (u.includes("/game/create")) return json({ code: "482193", creatorToken: "tok" });
    if (u.includes("workers.dev")) return json({ ok: true });
    return realFetch(url, opts);
  };
})();
`;

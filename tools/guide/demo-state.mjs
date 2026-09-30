// A lived-in demo profile for the guide screenshots, from the real question bank.
import fs from "node:fs";
const bank = JSON.parse(fs.readFileSync(new URL("public/questions.json", new URL("../../", import.meta.url)), "utf8"));
const L = Array.isArray(bank) ? bank : bank.questions;
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const bySystem = {};
for (const q of L) (bySystem[q.system] ||= []).push(q);
// how strong the player is in each system: a few clearly weak, most fine
const skill = { cardiovascular: 0.86, renal: 0.58, pulmonary: 0.83, gastrointestinal: 0.79, endocrine: 0.66, "hematology-oncology": 0.74, nervous: 0.71, dermatology: 0.62, infectious: 0.8, rheumatology: 0.85, "female-repro": 0.77, "allergy-immunology": 0.69, biostatistics: 0.9 };
const seen = {}; let answered = 0, correct = 0;
for (const [sys, qs] of Object.entries(bySystem)) {
  const p = skill[sys] ?? (0.62 + rnd() * 0.28);
  const n = Math.min(qs.length, 18 + Math.floor(rnd() * 40));
  for (let i = 0; i < n; i++) {
    const q = qs[Math.floor(rnd() * qs.length)];
    if (seen[q.id]) continue;
    const times = 1 + Math.floor(rnd() * 3);
    let r = 0, w = 0, last = 1;
    for (let k = 0; k < times; k++) { if (rnd() < p) { r++; last = 1; } else { w++; last = 0; } }
    seen[q.id] = [r, w, last]; answered += r + w; correct += r;
  }
}
// answered/correct kept consistent with seen; scale up a little for a fuller profile
const state = {
  points: 1284000, streak: 12, best: 19, answered, correct,
  seen, saved: [], timing: { binary: [Math.round(answered * 0.7 * 6100), Math.round(answered * 0.7)], gap: [Math.round(answered * 0.3 * 14200), Math.round(answered * 0.3)] },
  count: 10,
};
const mistakes = Object.entries(seen).filter(([, v]) => v[2] === 0).length;
fs.writeFileSync("demo-state.json", JSON.stringify(state));
console.log({ answered, correct, acc: Math.round(100 * correct / answered), used: Object.keys(seen).length, mistakes, bytes: JSON.stringify(state).length });
const pics = L.filter((q) => q.img).slice(0, 4).map((q) => q.id); console.log(pics);
console.log(Object.keys(bySystem).join(","));

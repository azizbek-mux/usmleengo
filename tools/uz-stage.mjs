// Turns a staged Uzbek file into the id-keyed file the compiler wants.
//
// Staging lets translation continue when the question ids are not to hand:
// each line is keyed by the start of the English question instead.
//
//   node tools/uz-stage.mjs <staged file> <english source, e.g. 50-endo.txt>
//
// A staged line is
//
//   english question prefix ~ uz topic|uz question|four|five|explanation
//
// The prefix must match exactly one question in that English file (the
// first characters are enough). Output goes to src/data/uz/<english file>,
// appended if it is already there. Nothing is written if any prefix misses
// or matches twice — the report says which.

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [staged, englishFile] = process.argv.slice(2);
if (!staged || !englishFile) {
  console.error("usage: node tools/uz-stage.mjs <staged file> <english file, e.g. 50-endo.txt>");
  process.exit(1);
}

const questions = JSON.parse(readFileSync(join(ROOT, "public/questions.json"), "utf8"));
const sources = JSON.parse(readFileSync(join(ROOT, "src/data/uz/.sources.json"), "utf8"));
const mine = questions.filter((q) => sources[q.id] === basename(englishFile));
if (!mine.length) {
  console.error(`no questions came from ${englishFile} — run npm run compile first`);
  process.exit(1);
}

const out = [];
const problems = [];
const used = new Set();
for (const [i, raw] of readFileSync(resolve(staged), "utf8").replace(/\r\n/g, "\n").split("\n").entries()) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const cut = line.indexOf("~");
  if (cut < 0) { problems.push(`line ${i + 1}: no ~ separating the English prefix from the Uzbek`); continue; }
  const prefix = line.slice(0, cut).trim();
  const uz = line.slice(cut + 1).trim();
  if (uz.split("|").length !== 5) { problems.push(`line ${i + 1}: expected 5 Uzbek fields, got ${uz.split("|").length}`); continue; }
  // An image question's "question" is its filename; the topic identifies it instead.
  const hits = mine.filter((q) => (q.img ? q.topic : q.q).startsWith(prefix));
  if (!hits.length) { problems.push(`line ${i + 1}: nothing in ${englishFile} starts with "${prefix.slice(0, 50)}"`); continue; }
  if (hits.length > 1) { problems.push(`line ${i + 1}: "${prefix.slice(0, 40)}" matches ${hits.length} questions — use a longer prefix`); continue; }
  if (used.has(hits[0].id)) { problems.push(`line ${i + 1}: ${hits[0].id} was already staged above`); continue; }
  used.add(hits[0].id);
  out.push(`${hits[0].id}|${uz}`);
}

if (problems.length) {
  console.error(`${problems.length} problem(s), nothing written:`);
  for (const p of problems.slice(0, 40)) console.error("  " + p);
  process.exit(1);
}

const target = join(ROOT, "src/data/uz", basename(englishFile));
const header = `# ${basename(englishFile, ".txt")} — o'zbekcha tarjima (qarang: TERMS.md)\n`;
if (existsSync(target)) appendFileSync(target, out.join("\n") + "\n", "utf8");
else writeFileSync(target, header + "\n" + out.join("\n") + "\n", "utf8");
console.log(`${out.length} line(s) → src/data/uz/${basename(englishFile)}`);

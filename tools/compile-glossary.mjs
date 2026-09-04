// Compiles the clinical English glossary CSV into the asset the app fetches.
//
// Source:  src/data/clinical-english-glossary.csv  (committed, the truth)
// Output:  public/glossary.json                    (generated, git-ignored)
//          src/data/glossary-version.js            (content hash, cache-buster)
//
// Run with `npm run compile:glossary` (or `npm run build`, which does both
// this and the question bank).
//
// The payload is rows of arrays rather than objects: 8,000 repetitions of the
// key names is hundreds of KB of nothing. Field order is emitted in the header
// so the loader never has to hard-code it.
//
// The CSV also carries etymology, category, is_phrase and the Russian columns.
// Nothing in the app reads them, so they are not shipped — the source file
// keeps them, and restoring one is a line here plus a rebuild.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src", "data", "clinical-english-glossary.csv");
const OUT = join(ROOT, "public", "glossary.json");
const VERSION_FILE = join(ROOT, "src", "data", "glossary-version.js");

// The deck ships exactly this many cards. Whatever the CSV holds, the most
// transliteration-like entries are dropped until the count lands here.
const TARGET = 8000;

// Same FNV-1a used for the question bank, so both caches bust the same way.
const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(-7);
};

/**
 * RFC 4180 CSV reader. The definitions contain commas and apostrophes, and a
 * few fields wrap across lines, so splitting on "," or "\n" corrupts the file
 * silently — which is exactly the class of bug that survives a spot check.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // escaped quote
        else quoted = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  // A final line with no trailing newline still holds data.
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ── transliteration detection ─────────────────────────────────────────────
   A card whose Uzbek side is the English word respelled teaches nothing:
   "17-alpha-hydroxylase / 17-alfa-gidroksilaza" is one word, not two. Both
   sides are reduced to a sound-skeleton that Uzbek and English medical
   spellings collapse onto, and the pair is scored by how close those are. */

function skeleton(s) {
  let t = s.toLowerCase()
    .replace(/[‘’ʻʼ']/g, "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

  t = t
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/sch/g, "s")
    .replace(/sh/g, "s")
    .replace(/ch/g, "c")
    .replace(/ck/g, "k")
    .replace(/x/g, "ks")
    .replace(/q/g, "k")
    .replace(/c/g, "k")
    .replace(/w/g, "v")
    .replace(/z/g, "s")
    .replace(/g/g, "h")     // Uzbek writes an English h- as g-
    .replace(/j/g, "i")
    .replace(/y/g, "i");

  return t
    .replace(/(.)\1+/g, "$1")   // doubled letters
    .replace(/[aeiou]/g, "");    // vowels carry almost nothing here
}

function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function similarity(en, uz) {
  const a = skeleton(en);
  const b = skeleton(uz);
  if (!a.length || !b.length) return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

// Yield is emitted as an index into this list — every row carries one, and
// storing the word costs ~80 KB to say three things.
const YIELDS = ["high", "medium", "low"];

const text = readFileSync(SRC, "utf8").replace(/^﻿/, "");
const table = parseCsv(text);
const header = table.shift().map((h) => h.trim());

const col = (name) => {
  const i = header.indexOf(name);
  if (i === -1) throw new Error(`glossary CSV is missing the "${name}" column`);
  return i;
};
const iTerm = col("term_en");
const iIpa = col("ipa");
const iUz = col("term_uz");
const iDef = col("definition_uz");
const iYld = col("yield");

const parsed = [];
const seen = new Set();
const problems = [];

for (const r of table) {
  if (!r || r.length < header.length) {
    if (r && r.join("").trim()) problems.push(`short row: ${r[0] || "(blank)"}`);
    continue;
  }
  const term = r[iTerm].trim();
  const uz = r[iUz].trim();
  const def = r[iDef].trim();

  // A card with no English front or no Uzbek back cannot be studied.
  if (!term || !uz || !def) { problems.push(`incomplete card: ${term || "(no term)"}`); continue; }

  const key = term.toLowerCase();
  if (seen.has(key)) { problems.push(`duplicate term: ${term}`); continue; }
  seen.add(key);

  const yld = YIELDS.indexOf(r[iYld].trim());
  if (yld === -1) { problems.push(`unknown yield "${r[iYld]}" on ${term}`); continue; }

  parsed.push({ term, ipa: r[iIpa].trim(), uz, def, yld, sim: similarity(term, uz) });
}

/* ── trim to exactly TARGET ────────────────────────────────────────────────
   Sorted most-transliterated first, and within a tie the lower-yield card
   goes first, so the cards that survive a tie are the ones worth knowing.
   The tiebreak has to be total and deterministic or the build is not
   reproducible and the cache hash changes for no reason. */

const dropCount = Math.max(0, parsed.length - TARGET);
parsed.sort((a, b) =>
  b.sim - a.sim ||
  b.yld - a.yld ||
  a.term.localeCompare(b.term));

const dropped = parsed.slice(0, dropCount);
const kept = parsed.slice(dropCount);

if (parsed.length < TARGET) {
  problems.push(`only ${parsed.length} usable cards — fewer than the ${TARGET} target`);
}

// Alphabetical for a stable browse order. Identity is the content hash below,
// not the position, so this ordering is free to change.
kept.sort((a, b) => a.term.toLowerCase().localeCompare(b.term.toLowerCase()));

/* ── stable ids ────────────────────────────────────────────────────────────
   Progress is stored against these, so a card must keep its id when the
   glossary is edited. Derived from the English term rather than the row
   position: trimming 479 cards shifts every index after the first one, which
   would silently reassign every schedule to the wrong word. */

const rows = [];
const ids = new Map();
for (const c of kept) {
  const id = hash(c.term);
  if (ids.has(id)) {
    throw new Error(`id collision: "${c.term}" and "${ids.get(id)}" both hash to ${id}`);
  }
  ids.set(id, c.term);
  rows.push([id, c.term, c.ipa, c.uz, c.def, c.yld]);
}

const payload = JSON.stringify({
  fields: ["id", "term", "ipa", "uz", "def", "yld"],
  yields: YIELDS,
  rows,
});

writeFileSync(OUT, payload, "utf8");
writeFileSync(
  VERSION_FILE,
  `// GENERATED by tools/compile-glossary.mjs — do not edit.\n` +
    `export const GLOSSARY_VERSION = "${hash(payload)}";\n` +
    `export const GLOSSARY_COUNT = ${rows.length};\n`,
  "utf8",
);

const byYld = YIELDS.map((y, i) => `${y} ${rows.filter((r) => r[5] === i).length}`);

console.log(`glossary cards : ${rows.length}`);
console.log(`payload        : ${(payload.length / 1048576).toFixed(2)} MB`);
console.log(`by yield       : ${byYld.join(", ")}`);
if (dropCount) {
  const cut = dropped[dropped.length - 1];
  console.log(`transliterations dropped : ${dropCount} (down to ${cut.sim.toFixed(2)} similarity)`);
  for (const c of dropped.slice(0, 3)) console.log(`   ${c.sim.toFixed(2)}  ${c.term} -> ${c.uz}`);
  console.log(`   …`);
  console.log(`   ${cut.sim.toFixed(2)}  ${cut.term} -> ${cut.uz}`);
}
if (problems.length) {
  console.log(`skipped        : ${problems.length}`);
  for (const p of problems.slice(0, 10)) console.log(`   ${p}`);
}

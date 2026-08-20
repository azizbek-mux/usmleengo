// Compiles the compact authoring format into src/data/questions.json.
//
// Questions are authored one per line in src/data/*.txt because the pipe format
// is far terser than JSON to write by hand at volume. This script parses,
// validates, de-duplicates and emits the single file the app imports.
//
//   B|topic|tag,tag|question|correct option|wrong option|explanation
//   G|topic|tag,tag|question with ___|answer|accept,accept|explanation
//
// Suffix the type with T to mark a question as tricky (BT / GT). Tricky
// questions use close distractors, changed context, or a second inference
// step; the session builder blends them in at roughly 40%.
//
// Run: node tools/compile.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "src", "data");
const PUBLIC = join(ROOT, "public");

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Collapse a question to its semantic core so near-duplicates collide. */
const fingerprint = (s) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const errors = [];
const questions = [];
const seenFp = new Set();
const seenId = new Set();
// Two questions can be worded differently and still test the same fact —
// which happens constantly when merging First Aid on top of UWorld. Keying on
// topic + answer catches those semantic repeats.
const seenFact = new Map();
let dupes = 0;
let factDupes = 0;
// A correct option visibly longer than its distractor is a free point: the
// reader can beat chance on length alone. Track it so it cannot creep back.
const lengthTells = [];

function parseLine(raw, file, lineNo) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) return;

  const p = line.split("|").map((s) => s.trim());
  const where = `${file}:${lineNo}`;
  const kind = p[0].toUpperCase();

  if (!["B", "G", "BT", "GT"].includes(kind)) {
    errors.push(`${where}: unknown type "${p[0]}" (expected B, G, BT or GT)`);
    return;
  }
  const base = kind[0];
  const difficulty = kind.endsWith("T") ? "tricky" : "easy";
  if (p.length !== 7) {
    errors.push(`${where}: expected 7 fields, got ${p.length}`);
    return;
  }

  const [, topic, tagStr, q, four, five, explain] = p;
  const tags = tagStr.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);

  if (!topic || !q || !explain) { errors.push(`${where}: empty topic/question/explanation`); return; }
  if (!tags.length) { errors.push(`${where}: no tags`); return; }

  const fp = fingerprint(q);
  if (seenFp.has(fp)) { dupes++; return; }
  seenFp.add(fp);

  const factKey = `${fingerprint(topic)}|${fingerprint(four)}|${difficulty}`;
  if (seenFact.has(factKey)) { factDupes++; return; }
  seenFact.set(factKey, where);

  let id = `${slug(topic)}-${kind.toLowerCase()}${questions.length}`;
  while (seenId.has(id)) id += "x";
  seenId.add(id);

  if (base === "B") {
    if (!four || !five) { errors.push(`${where}: binary needs both options`); return; }
    if (four.toLowerCase() === five.toLowerCase()) { errors.push(`${where}: identical options`); return; }
    if (q.includes("___")) { errors.push(`${where}: binary must not contain ___`); return; }
    if (four.length - five.length > 8) {
      lengthTells.push(`${where}: correct is ${four.length - five.length} chars longer`);
    }
    // Correct option is authored first; the app shuffles at runtime.
    questions.push({ id, type: "binary", difficulty, topic, tags, q, options: [four, five], answer: 0, explain });
  } else {
    if (!q.includes("___")) { errors.push(`${where}: gap missing ___`); return; }
    if (!four) { errors.push(`${where}: gap missing answer`); return; }
    const accept = [...new Set(
      [four, ...five.split(",")].map((s) => s.trim().toLowerCase()).filter(Boolean),
    )];
    if (!accept.includes(four.toLowerCase())) accept.unshift(four.toLowerCase());
    // The stem must not already contain the answer as a whole word, or the
    // question answers itself. Word-boundary matched so "oto" inside
    // "nephrotoxic" is not flagged.
    const stem = q.replace("___", " ").toLowerCase();
    const bare = four.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (bare.length > 2 && new RegExp(`\\b${bare}\\b`).test(stem)) {
      errors.push(`${where}: stem gives away the answer "${four}"`);
      return;
    }
    questions.push({ id, type: "gap", difficulty, topic, tags, q, answer: four, accept, explain });
  }
}

const files = readdirSync(DATA).filter((f) => f.endsWith(".txt")).sort();
if (!files.length) {
  console.error("No .txt source files found in src/data/");
  process.exit(1);
}

for (const f of files) {
  const text = readFileSync(join(DATA, f), "utf8");
  text.split(/\r?\n/).forEach((line, i) => parseLine(line, basename(f), i + 1));
}

if (errors.length) {
  console.error(`\n${errors.length} error(s):`);
  for (const e of errors.slice(0, 40)) console.error("  " + e);
  if (errors.length > 40) console.error(`  ...and ${errors.length - 40} more`);
  process.exit(1);
}

mkdirSync(PUBLIC, { recursive: true });
writeFileSync(join(PUBLIC, "questions.json"), JSON.stringify(questions), "utf8");

const byType = questions.reduce((a, q) => ((a[q.type] = (a[q.type] || 0) + 1), a), {});
const byDiff = questions.reduce((a, q) => ((a[q.difficulty] = (a[q.difficulty] || 0) + 1), a), {});
const tags = new Set(questions.flatMap((q) => q.tags));
console.log(`compiled ${questions.length} questions from ${files.length} file(s)`);
console.log(`  binary  : ${byType.binary || 0}`);
console.log(`  gap     : ${byType.gap || 0}`);
console.log(`  easy    : ${byDiff.easy || 0}`);
console.log(`  tricky  : ${byDiff.tricky || 0}  (${Math.round(100*(byDiff.tricky||0)/questions.length)}%)`);
console.log(`  topics  : ${new Set(questions.map((q) => q.topic)).size}`);
console.log(`  tags    : ${tags.size}`);
console.log(`  skipped : ${dupes} verbatim + ${factDupes} same-fact duplicate(s)`);
console.log(`  bytes   : ${(JSON.stringify(questions).length / 1024).toFixed(0)} KB`);
if (lengthTells.length) {
  console.log(`
  WARNING: ${lengthTells.length} question(s) leak the answer by option length.`);
  console.log("  Lengthen the distractor or trim the correct option so neither stands out.");
}

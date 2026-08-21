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

/**
 * Does the topic give the answer away?
 *
 * The app prints the topic as a chip directly above the question, so a topic
 * like "Telomerase" over "___ maintains chromosome ends" hands the reader the
 * answer. Flagged here rather than fixed by renaming the topics, because the
 * topic is also half the same-fact dedup key — renaming 298 of them would let
 * duplicates back in.
 */
const bagOf = (s) =>
  new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));

function topicLeaks(topic, right, wrong) {
  const t = bagOf(topic), c = bagOf(right);
  if (!t.size || !c.size) return false;
  const covered = (set) => [...set].filter((w) => t.has(w)).length / set.size;
  const cc = covered(c);
  if (cc < 0.8) return false;
  if (wrong == null) return true;                 // gap: nothing to compare against
  const w = bagOf(wrong);
  return w.size ? cc - covered(w) >= 0.5 : true;  // binary: only if it favours one side
}

// Question ids must be derived from CONTENT, never from position in the bank.
// Progress is stored per id (seen[id] drives spaced repetition), so an
// id that moved when questions were inserted above it would silently discard
// every user's history. FNV-1a: tiny, stable, and good enough to key on.
const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0").slice(-7);
};

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

  let id = `${slug(topic)}-${hash(`${topic}|${q}`)}`;
  while (seenId.has(id)) id = `${id}x`;
  seenId.add(id);

  if (base === "B") {
    if (!four || !five) { errors.push(`${where}: binary needs both options`); return; }
    if (four.toLowerCase() === five.toLowerCase()) { errors.push(`${where}: identical options`); return; }
    if (q.includes("___")) { errors.push(`${where}: binary must not contain ___`); return; }
    if (four.length - five.length > 8) {
      lengthTells.push(`${where}: correct is ${four.length - five.length} chars longer`);
    }
    // Correct option is authored first; the app shuffles at runtime.
    questions.push({ id, type: "binary", difficulty, topic, tags, q,
      options: [four, five], answer: 0, explain,
      ...(topicLeaks(topic, four, five) ? { hideTopic: true } : {}) });
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
    questions.push({ id, type: "gap", difficulty, topic, tags, q, answer: four, accept, explain,
      ...(topicLeaks(topic, four, null) ? { hideTopic: true } : {}) });
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
const payload = JSON.stringify(questions);
writeFileSync(join(PUBLIC, "questions.json"), payload, "utf8");

// questions.json lives in public/, so Vite copies it under a fixed name and a
// stale copy can be served after an update. Stamp its content hash into a
// generated module: the app appends it as ?v=, so the URL changes only when
// the bank actually changes — fresh on redeploy, still cacheable in between.
writeFileSync(
  join(DATA, "bank-version.js"),
  `// GENERATED by tools/compile.mjs — do not edit.\nexport const BANK_VERSION = "${hash(payload)}";\n`,
  "utf8"
);

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
console.log(`  topic hidden : ${questions.filter((x) => x.hideTopic).length} (topic would reveal the answer)`);
if (lengthTells.length) {
  console.log(`
  WARNING: ${lengthTells.length} question(s) leak the answer by option length.`);
  console.log("  Lengthen the distractor or trim the correct option so neither stands out.");
}

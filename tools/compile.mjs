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

// Pictures for image questions. Checked at compile time: a typo in a filename
// would otherwise ship as a question with a blank where the picture should be,
// and nothing downstream would notice.
const IMG_DIR = "img";
let images = new Set();
try {
  images = new Set(readdirSync(join(PUBLIC, IMG_DIR)));
} catch {
  /* no pictures yet — image questions will report themselves as missing */
}
const usedImages = new Set();

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
// Which file each question came from — for the Uzbek worklists only
// (tools/uz-worklist.mjs); never shipped.
const sourceOf = {};
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

  if (!["B", "G", "BT", "GT", "I", "IT"].includes(kind)) {
    errors.push(`${where}: unknown type "${p[0]}" (expected B, G, I, BT, GT or IT)`);
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

  // An image question's fourth field is a filename, not a stem — that file is
  // the whole question, so identity and de-duplication key on it.
  const fp = fingerprint(q);
  if (seenFp.has(fp)) { dupes++; return; }
  seenFp.add(fp);

  const factKey = `${fingerprint(topic)}|${fingerprint(four)}|${difficulty}`;
  if (seenFact.has(factKey)) { factDupes++; return; }
  seenFact.set(factKey, where);

  let id = `${slug(topic)}-${hash(`${topic}|${q}`)}`;
  while (seenId.has(id)) id = `${id}x`;
  seenId.add(id);
  sourceOf[id] = file;

  if (base === "I") {
    // The picture is the question: no stem, because a written hint is exactly
    // what makes an image question too easy.
    if (!images.has(q)) {
      errors.push(`${where}: no such image "${q}" in public/${IMG_DIR}`);
      return;
    }
    if (!four || !five) { errors.push(`${where}: image question needs both options`); return; }
    if (four.toLowerCase() === five.toLowerCase()) { errors.push(`${where}: identical options`); return; }
    if (four.length - five.length > 8) {
      lengthTells.push(`${where}: correct is ${four.length - five.length} chars longer`);
    }
    usedImages.add(q);
    // The topic is the disease, which is usually the answer, so the chip is
    // always suppressed here rather than left to the leak heuristic.
    questions.push({ id, type: "binary", difficulty, topic, tags, q: "", img: q,
      options: [four, five], answer: 0, explain, hideTopic: true });
  } else if (base === "B") {
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

const files = readdirSync(DATA).filter((f) => f.endsWith(".txt") && !f.startsWith(".")).sort();
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
/* ── Uzbek ────────────────────────────────────────────────────────────────
   Each English file has an Uzbek partner in src/data/uz/, one line per
   question, keyed by the English question's id:

     id|topic|question|four|five|explanation

   with four and five meaning what they mean in the English line (the right
   option and the wrong one; or the answer and other accepted spellings). A
   picture question's question field is left empty. The Uzbek terms agreed
   with the owner are in src/data/uz/TERMS.md; the apostrophe in o' and g'
   is always the plain one. Written to public/questions.uz.json, which the
   app loads in place of the English text when the player chooses Uzbek. */
const UZ = join(DATA, "uz");
const byId = new Map(questions.map((q) => [q.id, q]));
const uz = {};
const uzErrors = [];
const uzOrphans = [];
const uzLengthTells = [];
let uzFiles = [];
try { uzFiles = readdirSync(UZ).filter((f) => f.endsWith(".txt")).sort(); } catch { /* none yet */ }
const CURLY = /[‘’ʻʼ`]/;
// Uzbek here is Latin script. A Cyrillic or Turkish letter is a typo that
// reads as a different letter, so it must never reach the bank.
const FOREIGN = /[Ѐ-ӿİıŞşĞğ]/;
for (const f of uzFiles) {
  readFileSync(join(UZ, f), "utf8").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const where = `uz/${f}:${i + 1}`;
    const p = line.split("|").map((s) => s.trim());
    if (p.length !== 6) { uzErrors.push(`${where}: expected 6 fields, got ${p.length}`); return; }
    const [id, topic, q, four, five, explain] = p;
    const en = byId.get(id);
    if (!en) { uzOrphans.push(`${where}: ${id}`); return; }
    if (uz[id]) { uzErrors.push(`${where}: ${id} translated twice`); return; }
    if (!topic || !explain) { uzErrors.push(`${where}: empty topic or explanation`); return; }
    if (CURLY.test(line)) { uzErrors.push(`${where}: write o' and g' with the plain apostrophe`); return; }
    const foreign = line.match(FOREIGN);
    if (foreign) { uzErrors.push(`${where}: "${foreign[0]}" is a Cyrillic or Turkish letter, not Uzbek Latin`); return; }
    if (en.type === "gap") {
      if (!q.includes("___")) { uzErrors.push(`${where}: a typed question needs ___`); return; }
      if (!four) { uzErrors.push(`${where}: no answer`); return; }
      // The same check as the English: the stem must not hold its own answer.
      const bare = four.toLowerCase().replace(/[^a-z0-9' ]/g, "");
      if (bare.length > 2 && new RegExp(`(^|[^a-z0-9'])${bare.replace(/'/g, "\\'")}([^a-z0-9']|$)`).test(q.replace("___", " ").toLowerCase())) {
        uzErrors.push(`${where}: stem gives away the answer "${four}"`); return;
      }
      // Both languages' answers count: the Uzbek ones, and the English.
      const accept = [...new Set([four, ...five.split(",")].map((s) => s.trim().toLowerCase()).filter(Boolean).concat(en.accept))];
      uz[id] = { t: topic, q, a: four, c: accept, e: explain };
      if (topicLeaks(topic, four, null)) uz[id].h = 1;
    } else {
      if (!en.img && !q) { uzErrors.push(`${where}: empty question`); return; }
      if (q.includes("___")) { uzErrors.push(`${where}: a two-option question must not contain ___`); return; }
      if (!four || !five || four.toLowerCase() === five.toLowerCase()) { uzErrors.push(`${where}: needs two different options`); return; }
      if (four.length - five.length > 8) uzLengthTells.push(`${where}: correct is ${four.length - five.length} chars longer`);
      uz[id] = { t: topic, q: en.img ? "" : q, o: [four, five], e: explain };
      if (topicLeaks(topic, four, five)) uz[id].h = 1;
    }
  });
}
// One English topic, one Uzbek name: two names would split a topic in the
// search and in "Quiz me on…" into two half-topics.
const uzTopicNames = new Map();
for (const [id, u] of Object.entries(uz)) {
  const en = byId.get(id).topic;
  if (!uzTopicNames.has(en)) uzTopicNames.set(en, new Set());
  uzTopicNames.get(en).add(u.t);
}
const uzSplitTopics = [...uzTopicNames].filter(([, names]) => names.size > 1);
if (uzErrors.length) {
  console.error(`\n${uzErrors.length} Uzbek error(s):`);
  for (const e of uzErrors.slice(0, 40)) console.error("  " + e);
  process.exit(1);
}
const uzPayload = JSON.stringify(uz);
writeFileSync(join(PUBLIC, "questions.uz.json"), uzPayload, "utf8");
// For tools/uz-worklist.mjs: which file each question is in. Not shipped.
writeFileSync(join(UZ, ".sources.json"), JSON.stringify(sourceOf), "utf8");

writeFileSync(
  join(DATA, "bank-version.js"),
  `// GENERATED by tools/compile.mjs — do not edit.\nexport const BANK_VERSION = "${hash(payload)}";\n` +
  `export const BANK_UZ_VERSION = "${hash(uzPayload)}";\n`,
  "utf8"
);

const byType = questions.reduce((a, q) => ((a[q.type] = (a[q.type] || 0) + 1), a), {});
const byDiff = questions.reduce((a, q) => ((a[q.difficulty] = (a[q.difficulty] || 0) + 1), a), {});
const tags = new Set(questions.flatMap((q) => q.tags));
console.log(`compiled ${questions.length} questions from ${files.length} file(s)`);
const withImg = questions.filter((x) => x.img).length;
console.log(`  binary  : ${byType.binary || 0}  (${withImg} of them a picture)`);
console.log(`  gap     : ${byType.gap || 0}`);
console.log(`  easy    : ${byDiff.easy || 0}`);
console.log(`  tricky  : ${byDiff.tricky || 0}  (${Math.round(100*(byDiff.tricky||0)/questions.length)}%)`);
console.log(`  topics  : ${new Set(questions.map((q) => q.topic)).size}`);
console.log(`  tags    : ${tags.size}`);
console.log(`  skipped : ${dupes} verbatim + ${factDupes} same-fact duplicate(s)`);
console.log(`  bytes   : ${(JSON.stringify(questions).length / 1024).toFixed(0)} KB`);
console.log(`  topic hidden : ${questions.filter((x) => x.hideTopic).length} (topic would reveal the answer)`);
const uzCount = Object.keys(uz).length;
console.log(`  uzbek   : ${uzCount} of ${questions.length} translated (${Math.floor((100 * uzCount) / questions.length)}%)` +
            (uzOrphans.length ? `, ${uzOrphans.length} line(s) for questions that no longer exist` : ""));
for (const o of uzOrphans.slice(0, 10)) console.log(`    orphan ${o}`);
if (uzSplitTopics.length) {
  console.log(`  uzbek topics with two names: ${uzSplitTopics.length}`);
  for (const [en, names] of uzSplitTopics.slice(0, 10)) console.log(`    ${en}: ${[...names].join(" / ")}`);
}
if (uzLengthTells.length) {
  console.log(`  uzbek length tells: ${uzLengthTells.length} (the right option visibly longer)`);
  for (const l of uzLengthTells.slice(0, 10)) console.log(`    ${l}`);
}

// Pictures that ship but no question uses are dead weight in the repository
// and in every clone of it.
if (images.size) {
  const unused = [...images].filter((f) => !usedImages.has(f));
  console.log(`  pictures : ${usedImages.size} used of ${images.size}` +
              (unused.length ? `, ${unused.length} unused` : ""));
}
if (lengthTells.length) {
  console.log(`
  WARNING: ${lengthTells.length} question(s) leak the answer by option length.`);
  console.log("  Lengthen the distractor or trim the correct option so neither stands out.");
}

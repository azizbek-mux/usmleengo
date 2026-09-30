// The Uzbek translation's worklist. Run `npm run compile` first.
//
//   node tools/uz-worklist.mjs               how far each file has got
//   node tools/uz-worklist.mjs 10-cardio.txt the file's questions, to translate
//   node tools/uz-worklist.mjs 10-cardio.txt --missing   only the untranslated
//
// A question prints as
//
//   id|TYPE|topic|question|four|five|explanation
//
// with TYPE B (two options: four right, five wrong), G (typed: four the
// answer, five other accepted spellings) or I (a picture: question is the
// file). The Uzbek line in src/data/uz/<same file> drops TYPE:
//
//   id|topic|question|four|five|explanation

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const questions = read("public/questions.json");
const sources = read("src/data/uz/.sources.json");
const done = existsSync(join(ROOT, "public/questions.uz.json")) ? read("public/questions.uz.json") : {};

const [file, flag] = process.argv.slice(2);

if (!file) {
  const byFile = new Map();
  for (const q of questions) {
    const f = sources[q.id];
    if (!byFile.has(f)) byFile.set(f, [0, 0]);
    const row = byFile.get(f);
    row[0]++;
    if (done[q.id]) row[1]++;
  }
  let total = 0, translated = 0;
  for (const [f, [n, d]] of [...byFile].sort()) {
    total += n; translated += d;
    console.log(`${d === n ? "✓" : d ? "…" : " "} ${f.padEnd(28)} ${String(d).padStart(4)} / ${n}`);
  }
  console.log(`\n${translated} of ${total} translated`);
  process.exit(0);
}

const mine = questions.filter((q) => sources[q.id] === file && (flag !== "--missing" || !done[q.id]));
if (!mine.length) { console.error(`nothing to list for ${file}`); process.exit(1); }
for (const q of mine) {
  if (q.type === "gap") {
    const others = q.accept.filter((a) => a !== q.answer.toLowerCase());
    console.log([q.id, "G", q.topic, q.q, q.answer, others.join(", "), q.explain].join("|"));
  } else {
    console.log([q.id, q.img ? "I" : "B", q.topic, q.img || q.q, q.options[0], q.options[1], q.explain].join("|"));
  }
}

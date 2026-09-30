// The Uzbek questions whose right option is visibly longer than its
// distractor — a reader can beat those on length alone. Prints the line
// number and both options so they can be evened up.
//
//   node tools/uz-tells.mjs            every Uzbek file
//   node tools/uz-tells.mjs 60-renal   one of them

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const UZ = join(ROOT, "src/data/uz");
const uz = JSON.parse(readFileSync(join(ROOT, "public/questions.uz.json"), "utf8"));
const only = process.argv[2];

let found = 0;
for (const file of readdirSync(UZ).filter((f) => f.endsWith(".txt"))) {
  if (only && !file.startsWith(only)) continue;
  const lines = readFileSync(join(UZ, file), "utf8").replace(/\r\n/g, "\n").split("\n");
  lines.forEach((line, i) => {
    const id = line.split("|")[0];
    const entry = uz[id];
    if (!entry?.o) return;
    const gap = entry.o[0].length - entry.o[1].length;
    if (gap <= 8) return;
    found++;
    console.log(`${file}:${i + 1}  +${gap}\n  right: ${entry.o[0]}\n  wrong: ${entry.o[1]}`);
  });
}
console.log(found ? `\n${found} to even up` : "none — every option pair is balanced");

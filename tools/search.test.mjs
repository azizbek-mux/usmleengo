// The topic search, in the two languages the app is read in. A student
// reading Uzbek still types English - "apoptosis", "mi", "pheochromocytoma" -
// because that is what the exam and every textbook call things, so the
// search reads a question's English topic and stem as well as the Uzbek ones.

const bank = (await import(new URL("../src/data/bank.js", import.meta.url).href)).default;
const M = await import(new URL("../src/lib/match.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

// A question as the bank holds it once Uzbek is showing (bank.js localize):
// the Uzbek text in topic and q, the English kept alongside as enTopic, enQ.
const uz = (id, topic, q, enTopic, enQ, tags = ["patho"]) => ({ id, type: "binary", tags, topic, q, enTopic, enQ, options: ["a", "b"] });
// And one in English alone, as before.
const en = (id, topic, q, tags = ["patho"]) => ({ id, type: "binary", tags, topic, q, options: ["a", "b"] });

bank.push(
  uz("apo", "Apoptoz", "Hujayra o'z-o'zini yo'q qilishi nima", "Apoptosis", "Programmed cell death is"),
  uz("necro", "Nekroz", "Hujayra nobud bo'lishi", "Necrosis", "Unregulated cell death is"),
  uz("mi", "Miokard infarkti", "Yurak mushagi o'limi", "Myocardial infarction", "Heart muscle death is", ["cardio"]),
  uz("pheo", "Feoxromotsitoma", "Buyrak usti o'smasi", "Pheochromocytoma", "Episodic hypertension with sweating is", ["endocrine"]),
  en("plain", "Gout", "Uric acid crystals cause", ["rheum"]),
);

console.log("\nthe Uzbek names still work");
check("apoptoz", M.search("apoptoz")[0]?.id === "apo");
check("nekroz", M.search("nekroz")[0]?.id === "necro");
check("miokard infarkti", M.search("miokard infarkti")[0]?.id === "mi");

console.log("\nand so do the English ones, in an Uzbek bank");
check("apoptosis finds Apoptoz", M.search("apoptosis")[0]?.id === "apo");
check("necrosis finds Nekroz", M.search("necrosis")[0]?.id === "necro");
check("pheochromocytoma finds Feoxromotsitoma", M.search("pheochromocytoma")[0]?.id === "pheo");
check("a phrase in the English stem", M.search("programmed cell death")[0]?.id === "apo");
check("an English word matches only its own question", M.search("necrosis").length === 1, `${M.search("necrosis").length}`);
check("the abbreviations, which are English: MI", M.search("mi")[0]?.id === "mi");
check("and a two-word English topic", M.search("myocardial infarction")[0]?.id === "mi");

console.log("\nnothing else changes");
check("an English-only question is found as before", M.search("gout")[0]?.id === "plain");
check("a word in neither language finds nothing", M.search("zzzqx").length === 0);
check("an empty search finds nothing", M.search("   ").length === 0);

console.log("\ncost");
const many = [];
for (let i = 0; i < 6600; i++) many.push(uz(`x${i}`, `Mavzu ${i}`, `Savol ${i}`, `Topic ${i}`, `Question ${i}`));
bank.push(...many);
M.search("warm-up");
const t0 = performance.now();
for (let i = 0; i < 10; i++) M.search("apoptosis");
const each = (performance.now() - t0) / 10;
check(`a search over ${bank.length.toLocaleString()} questions takes ${each.toFixed(1)} ms`, each < 40, `${each}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

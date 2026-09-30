// The normal lab values are typed in by hand, so this is a check against
// typing slips, not against medicine: every row has a name, a range and a
// unit in the shape the sheet expects, no test appears twice in a section,
// and a few values every student knows are what they should be. The ranges
// themselves are the owner's to proofread.

const { LABS } = await import(new URL("../src/data/labs.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const all = LABS.flatMap((s) => s.rows.map((r) => ({ section: s.id, name: r[0], range: r[1], unit: r[2] })));
const find = (section, name) => all.find((r) => r.section === section && r.name === name);

console.log("\nthe shape");
check("there are sections, each with a title in both languages and rows", LABS.length >= 8 && LABS.every((s) => s.id && s.en && s.uz && s.rows.length));
check("section ids are unique", new Set(LABS.map((s) => s.id)).size === LABS.length);
check("every row is [name, range, unit]", LABS.every((s) => s.rows.every((r) => r.length === 3 && r.every((x) => typeof x === "string"))));
check("every name and range is filled in", all.every((r) => r.name.trim() && r.range.trim()));
check("no test twice in a section", LABS.every((s) => new Set(s.rows.map((r) => r[0])).size === s.rows.length));
check("a range is a span, a limit, or a limit from control",
  all.every((r) => /^(\d[\d,.]*\s?[–-]\s?\d[\d,.]*|<\s?\d[\d,.]*( s from control)?)$/.test(r.range)), all.filter((r) => !/^(\d[\d,.]*\s?[–-]\s?\d[\d,.]*|<\s?\d[\d,.]*( s from control)?)$/.test(r.range)).map((r) => r.name).join());
check("a span runs upward", all.every((r) => {
  const m = /^([\d,.]+)–([\d,.]+)$/.exec(r.range);
  return !m || parseFloat(m[1].replace(/,/g, "")) < parseFloat(m[2].replace(/,/g, ""));
}));
check("the units are not left blank, except for pH and the control time", all.filter((r) => !r.unit).map((r) => r.name).sort().join() === "Thrombin time,pH");

console.log("\nthe values everyone knows");
check("sodium 136–146 mEq/L", find("chemistry", "Sodium")?.range === "136–146" && find("chemistry", "Sodium").unit === "mEq/L");
check("potassium 3.5–5.0 mEq/L", find("chemistry", "Potassium")?.range === "3.5–5.0");
check("creatinine 0.6–1.2 mg/dL", find("chemistry", "Creatinine")?.range === "0.6–1.2");
check("arterial pH 7.35–7.45", find("abg", "pH")?.range === "7.35–7.45");
check("platelets 150,000–400,000", find("hematology", "Platelets")?.range === "150,000–400,000");
check("MCV 80–100", find("hematology", "MCV")?.range === "80–100");
check("prothrombin time 11–15 s", find("coagulation", "Prothrombin time")?.range === "11–15");
check("the sexes are kept apart where the range differs", find("hematology", "Hemoglobin, male") && find("hematology", "Hemoglobin, female"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

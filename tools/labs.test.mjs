// The NBME lab values are typed in by hand from the NBME "Laboratory Values"
// page, so this is a check against typing slips, not against medicine: every
// row has a name, a range and a unit in both systems in the shape the sheet
// expects, no test appears twice in a section, the count matches the
// page's, and a few values every student knows are what they should be.

const { LABS } = await import(new URL("../src/data/labs.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const all = LABS.flatMap((s) => s.rows.map((r) => ({ section: s.id, name: r[0], range: r[1], unit: r[2], si: r[3], siUnit: r[4] })));
const find = (section, name) => all.find((r) => r.section === section && r.name === name);

// A span (136–146), a limit (<140, ≤0.04, >7), or a limit against a control (<50%).
const SHAPE = /^([<>≤≥]?\d[\d,.]*%?|\d[\d,.]*–\d[\d,.]*)$/;

console.log("\nthe shape");
check("there are sections, each with a title in both languages and rows", LABS.length === 14 && LABS.every((s) => s.id && s.en && s.uz && s.rows.length));
check("section ids are unique", new Set(LABS.map((s) => s.id)).size === LABS.length);
check("every row is [name, range, unit, SI range, SI unit], all text", LABS.every((s) => s.rows.every((r) => r.length === 5 && r.every((x) => typeof x === "string"))));
check("every name and both ranges are filled in", all.every((r) => r.name.trim() && r.range.trim() && r.si.trim()));
check("no test twice in a section", LABS.every((s) => new Set(s.rows.map((r) => r[0])).size === s.rows.length));
check("no test twice anywhere", new Set(all.map((r) => r.name)).size === all.length);
check("114 tests, as on the NBME page", all.length === 114, `${all.length}`);
check("a range is a span or a limit", all.every((r) => SHAPE.test(r.range) && SHAPE.test(r.si)),
  all.filter((r) => !SHAPE.test(r.range) || !SHAPE.test(r.si)).map((r) => r.name).join());
check("a span runs upward", all.every((r) => [r.range, r.si].every((x) => {
  const m = /^([\d,.]+)–([\d,.]+)$/.exec(x);
  return !m || parseFloat(m[1].replace(/,/g, "")) < parseFloat(m[2].replace(/,/g, ""));
})));
// Where a value is a plain fraction or a pH there is no unit to print: on the conventional side pH
// only, and on the SI side the fractions the NBME gives as percentages.
check("the conventional unit is blank only for pH", all.filter((r) => !r.unit).map((r) => r.name).join() === "pH");
check("the SI unit is blank only for fractions", all.filter((r) => !r.siUnit).every((r) => r.unit === "%" || r.unit.startsWith("% ") || r.unit === "" ));
check("no stray spaces", all.every((r) => [r.name, r.range, r.unit, r.si, r.siUnit].every((x) => x === x.trim())));

console.log("\nthe values everyone knows");
check("sodium 136–146 mEq/L, and 136–146 mmol/L", find("chemistry", "Sodium (Na⁺)")?.range === "136–146" && find("chemistry", "Sodium (Na⁺)").unit === "mEq/L" && find("chemistry", "Sodium (Na⁺)").siUnit === "mmol/L");
check("potassium 3.5–5.0 mEq/L", find("chemistry", "Potassium (K⁺)")?.range === "3.5–5.0");
check("creatinine 0.6–1.2 mg/dL, 53–106 µmol/L", find("chemistry", "Creatinine")?.range === "0.6–1.2" && find("chemistry", "Creatinine").si === "53–106");
check("arterial pH 7.35–7.45", find("abg", "pH")?.range === "7.35–7.45");
check("platelets 150,000–400,000 /mm³, 150–400 × 10⁹/L", find("cbc", "Platelet count")?.range === "150,000–400,000" && find("cbc", "Platelet count").si === "150–400");
check("MCV 80–100", find("cbc", "Mean corpuscular volume (MCV)")?.range === "80–100");
check("prothrombin time 11–15 seconds", find("coagulation", "Prothrombin time (PT)")?.range === "11–15");
check("aPTT 25–40 seconds", find("coagulation", "Partial thromboplastin time (aPTT, activated)")?.range === "25–40");
check("troponin I ≤0.04 ng/mL", find("serum-other", "Troponin I")?.range === "≤0.04");
check("HbA1c ≤6 %, ≤42 mmol/mol", find("heme-other", "Hemoglobin A1c")?.range === "≤6" && find("heme-other", "Hemoglobin A1c").si === "≤42");
check("the sexes are kept apart where the range differs", find("cbc", "Hemoglobin, male") && find("cbc", "Hemoglobin, female"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Topic search — the part that replaces an LLM call.
//
// The user types free text ("addisons", "what happens to K in addison",
// "adrenal insufficiency") and we score every question in the bank against it.
// No network, no API key, instant.

import bank from "../data/bank.js";

// Abbreviations and synonyms a med student will actually type. Each maps to
// extra tokens that get folded into the query before scoring.
const ALIASES = {
  mi: ["myocardial", "infarction"],
  htn: ["hypertension"],
  chf: ["heart", "failure"],
  af: ["atrial", "fibrillation"],
  afib: ["atrial", "fibrillation"],
  copd: ["copd", "obstructive"],
  dm: ["diabetes"],
  dka: ["dka", "diabetes", "ketoacidosis"],
  tb: ["tuberculosis"],
  uti: ["urinary", "infection"],
  ibd: ["crohn", "colitis"],
  uc: ["ulcerative", "colitis"],
  ms: ["multiple", "sclerosis"],
  mg: ["myasthenia", "gravis"],
  gbs: ["guillain", "barre"],
  ckd: ["renal", "kidney"],
  aki: ["renal", "kidney", "azotemia"],
  cll: ["leukemia"],
  cml: ["cml", "leukemia"],
  itp: ["itp", "platelets"],
  dic: ["dic", "coagulation"],
  pud: ["peptic", "ulcer"],
  gerd: ["esophagus", "reflux"],
  pcos: ["pcos", "ovary"],
  siadh: ["siadh", "adh"],
  di: ["diabetes", "insipidus"],
  pku: ["phenylketonuria"],
  cf: ["cystic", "fibrosis"],
  hocm: ["hypertrophic", "cardiomyopathy"],
  wpw: ["wolff", "parkinson", "white"],
  cgd: ["chronic", "granulomatous"],
  g6pd: ["g6pd"],
  ace: ["ace", "inhibitors"],
  nsaid: ["nsaids", "prostaglandins"],
  nsaids: ["nsaids", "prostaglandins"],
  potassium: ["k+", "potassium"],
  sodium: ["na+", "sodium"],
  calcium: ["calcium", "ca"],
  vitamins: ["vitamin"],
  adrenal: ["adrenal", "addison", "cushing"],
  thyroid: ["thyroid", "tsh"],
  antidote: ["antidote", "toxicology", "overdose"],
  anemia: ["anemia"],
  murmur: ["murmur", "valve"],
};

// Words that carry no discriminating signal in a medical topic.
const STOP = new Set([
  "the", "a", "an", "of", "in", "is", "are", "to", "and", "or", "for", "with",
  "what", "which", "how", "why", "does", "do", "on", "at", "by", "from", "it",
  "disease", "syndrome", "disorder", "deficiency", "test", "level", "levels",
  "me", "give", "about", "quiz", "question", "questions",
]);

export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const out = [];
  for (const raw of normalize(s).split(" ")) {
    if (!raw || STOP.has(raw)) continue;
    // Light stemming: trailing plural only. Medical terms break under
    // anything more aggressive ("diabetes" -> "diabete").
    const t = raw.length > 4 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw;
    out.push(t);
    const alias = ALIASES[raw] || ALIASES[t];
    if (alias) out.push(...alias);
  }
  return [...new Set(out)];
}

function haystack(q) {
  return normalize([q.topic, q.tags.join(" "), q.q, q.answer || "", (q.options || []).join(" ")].join(" "));
}

function score(q, query, tokens) {
  const topic = normalize(q.topic);
  const tags = q.tags.map(normalize);
  const text = normalize(q.q);
  let s = 0;

  if (topic === query) s += 120;
  else if (topic.includes(query) || (query.length > 3 && query.includes(topic))) s += 70;

  for (const t of tokens) {
    if (topic === t) s += 50;
    else if (topic.includes(t)) s += 30;

    if (tags.includes(t)) s += 25;
    else if (tags.some((tag) => tag.includes(t))) s += 12;

    if (text.includes(t)) s += 8;
  }

  // Reward covering more of what the user typed, so a two-word query prefers
  // a question matching both words over one matching a single word twice.
  const hay = haystack(q);
  const covered = tokens.filter((t) => hay.includes(t)).length;
  if (tokens.length) s += Math.round((covered / tokens.length) * 40);

  return s;
}

/** Ranked matches for a free-text query. */
export function search(query, limit = 40) {
  const norm = normalize(query);
  if (!norm) return [];
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  return bank
    .map((q) => ({ q, s: score(q, norm, tokens) }))
    .filter((r) => r.s >= 30)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((r) => r.q);
}

/** Distinct topic names, for the browse screen and for "did you mean". */
export function allTopics() {
  return [...new Set(bank.map((q) => q.topic))].sort((a, b) => a.localeCompare(b));
}

/** Closest topic names when a search comes back empty. */
export function suggest(query, limit = 6) {
  const tokens = tokenize(query);
  if (!tokens.length) return allTopics().slice(0, limit);
  const scored = allTopics().map((topic) => {
    const n = normalize(topic);
    let s = 0;
    for (const t of tokens) {
      if (n.includes(t)) s += 10;
      // First-three-letters overlap catches typos and truncations.
      else if (t.length >= 3 && n.includes(t.slice(0, 3))) s += 3;
    }
    return { topic, s };
  });
  return scored.filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map((r) => r.topic);
}

/** Every distinct tag, used as the subject chips on the home screen. */
export function subjects() {
  const counts = new Map();
  for (const q of bank) for (const t of q.tags) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n >= 4)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => ({ tag, n }));
}

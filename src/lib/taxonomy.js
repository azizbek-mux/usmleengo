// The two ways a question is filed: its system and its subject.
//
// Every question belongs to exactly one of each, the way the big question
// banks file them. They are independent axes and that is the whole point:
// "what is valsartan's mechanism?" is Pharmacology by subject and the
// Cardiovascular System by system, and a student revising either should
// meet it.
//
//   system  — the organ system the question is about
//   subject — the discipline it is asked from
//
// The five "(General Principles)" systems are not a dumping ground. A
// question lands in one only when it belongs to no organ system at all:
// apoptosis and necrosis are Pathology (General Principles), but liver cell
// death in hepatitis is the Gastrointestinal system asked from Pathology.
// The rules below are ordered so an organ always wins.
//
// The fine-grained tags in the bank are untouched. They still drive search,
// the weak-topic list and a class's packages; these two axes are how the
// bank is browsed.

import { isUz } from "./i18n.js";

/* ── systems ─────────────────────────────────────────────────────────── */

export const SYSTEMS = [
  { id: "allergy-immunology", en: "Allergy & Immunology", uz: "Allergiya va immunologiya", short: "immun" },
  { id: "biochemistry-gp", en: "Biochemistry (General Principles)", uz: "Biokimyo (umumiy tamoyillar)", short: "biokimyo" },
  { id: "biostatistics", en: "Biostatistics & Epidemiology", uz: "Biostatistika va epidemiologiya", short: "biostat" },
  { id: "cardiovascular", en: "Cardiovascular System", uz: "Yurak-qon tomir tizimi", short: "kardio" },
  { id: "dermatology", en: "Dermatology", uz: "Dermatologiya", short: "derma" },
  { id: "ent", en: "Ear, Nose & Throat (ENT)", uz: "Quloq, burun va tomoq", short: "QBT" },
  { id: "endocrine", en: "Endocrine, Diabetes & Metabolism", uz: "Endokrinologiya, diabet va metabolizm", short: "endo" },
  { id: "female-repro", en: "Female Reproductive System & Breast", uz: "Ayol jinsiy tizimi va sut bezi", short: "ginekologiya" },
  { id: "gastrointestinal", en: "Gastrointestinal & Nutrition", uz: "Oshqozon-ichak tizimi va ovqatlanish", short: "gastro" },
  { id: "genetics-gp", en: "Genetics (General Principles)", uz: "Genetika (umumiy tamoyillar)", short: "genetika" },
  { id: "hematology-oncology", en: "Hematology & Oncology", uz: "Gematologiya va onkologiya", short: "gemato-onko" },
  { id: "infectious", en: "Infectious Diseases", uz: "Yuqumli kasalliklar", short: "infeksiya" },
  { id: "male-repro", en: "Male Reproductive System", uz: "Erkak jinsiy tizimi", short: "androlog" },
  { id: "microbiology-gp", en: "Microbiology (General Principles)", uz: "Mikrobiologiya (umumiy tamoyillar)", short: "mikro" },
  { id: "miscellaneous", en: "Miscellaneous (Multisystem)", uz: "Aralash (ko'p tizimli)", short: "aralash" },
  { id: "nervous", en: "Nervous System", uz: "Nerv tizimi", short: "nevro" },
  { id: "ophthalmology", en: "Ophthalmology", uz: "Oftalmologiya", short: "oftalmo" },
  { id: "pathology-gp", en: "Pathology (General Principles)", uz: "Patologiya (umumiy tamoyillar)", short: "patologiya" },
  { id: "pharmacology-gp", en: "Pharmacology (General Principles)", uz: "Farmakologiya (umumiy tamoyillar)", short: "farma" },
  { id: "poisoning", en: "Poisoning & Environmental Exposure", uz: "Zaharlanish va atrof-muhit ta'siri", short: "toksiko" },
  { id: "pregnancy", en: "Pregnancy, Childbirth & Puerperium", uz: "Homiladorlik, tug'ruq va undan keyingi davr", short: "akusherlik" },
  { id: "psychiatric", en: "Psychiatric/Behavioral & Substance Use Disorder", uz: "Psixiatriya, xulq-atvor va giyohvandlik", short: "psixiatriya" },
  { id: "pulmonary", en: "Pulmonary & Critical Care", uz: "Pulmonologiya va reanimatsiya", short: "pulmo" },
  { id: "renal", en: "Renal, Urinary Systems & Electrolytes", uz: "Buyrak, siydik tizimi va elektrolitlar", short: "nefro" },
  { id: "rheumatology", en: "Rheumatology/Orthopedics & Sports", uz: "Revmatologiya, ortopediya va sport", short: "revmato" },
  { id: "social-sciences", en: "Social Sciences (Ethics/Legal/Professional)", uz: "Ijtimoiy fanlar (axloq, huquq, kasb)", short: "axloq" },
];

/* ── subjects ────────────────────────────────────────────────────────── */

export const SUBJECTS = [
  { id: "anatomy", en: "Anatomy", uz: "Anatomiya", short: "anatomiya" },
  { id: "behavioral", en: "Behavioral science", uz: "Xulq-atvor fanlari", short: "xulq-atvor" },
  { id: "biochemistry", en: "Biochemistry", uz: "Biokimyo", short: "biokimyo" },
  { id: "biostatistics", en: "Biostatistics", uz: "Biostatistika", short: "biostat" },
  { id: "embryology", en: "Embryology", uz: "Embriologiya", short: "embrio" },
  { id: "genetics", en: "Genetics", uz: "Genetika", short: "genetika" },
  { id: "histology", en: "Histology", uz: "Gistologiya", short: "gisto" },
  { id: "immunology", en: "Immunology", uz: "Immunologiya", short: "immuno" },
  { id: "microbiology", en: "Microbiology", uz: "Mikrobiologiya", short: "mikro" },
  { id: "pathology", en: "Pathology", uz: "Patologiya", short: "patologiya" },
  { id: "pathophysiology", en: "Pathophysiology", uz: "Patofiziologiya", short: "patofiz" },
  { id: "pharmacology", en: "Pharmacology", uz: "Farmakologiya", short: "farma" },
  { id: "physiology", en: "Physiology", uz: "Fiziologiya", short: "fiziologiya" },
];

/* ── how a question's tags decide where it is filed ──────────────────── */

// Order matters in both tables: the first rule whose tags the question
// carries wins. Organ systems come before the general-principles ones, so a
// drug question about the heart is filed under the heart.
const SYSTEM_RULES = [
  ["pregnancy", ["ob", "teratogen"]],
  ["female-repro", ["gyn"]],
  ["male-repro", ["urology-male"]],
  ["cardiovascular", ["cardio", "vascular", "arrhythmia", "mi", "valve", "heart failure", "murmur", "ecg", "hypertension", "angina"]],
  ["nervous", ["neuro", "stroke", "epilepsy", "dementia", "movement", "headache", "parkinson", "cerebellum", "spinal cord", "cranial nerves", "csf", "motor", "nmj", "consciousness"]],
  ["pulmonary", ["resp", "asthma", "critical care", "influenza"]],
  ["renal", ["renal", "aki", "nephrotic", "stones", "proteinuria", "hematuria", "electrolytes", "acid base", "urology", "fluid"]],
  ["gastrointestinal", ["gi", "liver", "pancreas", "ibd", "motility", "hepatitis", "nutrition", "vitamins"]],
  ["endocrine", ["endocrine", "thyroid", "adrenal", "pituitary", "diabetes", "calcium"]],
  ["hematology-oncology", ["heme", "anemia", "coagulation", "platelets", "oncology"]],
  ["dermatology", ["derm"]],
  ["ophthalmology", ["eye"]],
  ["ent", ["ent"]],
  ["rheumatology", ["msk", "rheum", "ortho", "bone", "muscle"]],
  ["psychiatric", ["psych", "mood", "psychosis", "anxiety", "addiction", "personality", "sleep", "eating", "defense mechanisms"]],
  ["repro", ["repro"]], // split by sex below
  ["infectious", ["micro", "bacteria", "virus", "fungi", "parasite", "hiv", "tb", "vaccines", "malaria", "infection"]],
  ["allergy-immunology", ["immuno", "hypersensitivity", "autoimmune", "transplant", "antibody", "complement", "cytokines", "antigen presentation", "innate"]],
  ["poisoning", ["toxicology", "antidote", "toxicity"]],
  ["social-sciences", ["ethics", "health systems", "safety", "palliative", "infection control", "procedure"]],
  ["biostatistics", ["biostats", "epidemiology", "risk"]],
  ["pharmacology-gp", ["pharm", "antibiotics", "anesthesia", "nsaids", "side effect", "autonomic"]],
  ["biochemistry-gp", ["biochem", "metabolism", "glycogen", "amino acids", "glycolysis", "lipids"]],
  ["genetics-gp", ["genetics", "congenital"]],
  ["pathology-gp", ["path", "cell death", "inflammation", "healing", "adaptation", "metaplasia", "aging"]],
];

const SUBJECT_RULES = [
  ["biostatistics", ["biostats", "epidemiology", "risk"]],
  ["behavioral", ["psych", "mood", "psychosis", "anxiety", "addiction", "personality", "defense mechanisms", "eating", "sleep", "ethics", "health systems", "palliative", "aging", "geriatrics", "development", "language", "memory", "safety"]],
  ["pharmacology", ["pharm", "antibiotics", "antidote", "anesthesia", "nsaids", "side effect", "toxicity", "toxicology"]],
  ["microbiology", ["micro", "bacteria", "virus", "fungi", "parasite", "hiv", "tb", "vaccines", "gram positive", "gram negative", "influenza", "malaria", "hepatitis", "infection control", "infection"]],
  ["immunology", ["immuno", "antibody", "complement", "cytokines", "hypersensitivity", "antigen presentation", "innate", "autoimmune", "transplant"]],
  ["biochemistry", ["biochem", "vitamins", "metabolism", "glycogen", "amino acids", "glycolysis", "lipids", "nutrition"]],
  ["genetics", ["genetics", "congenital", "teratogen"]],
  ["histology", ["histo", "stains", "cell biology"]],
  ["embryology", ["embryology"]],
  ["anatomy", ["anatomy", "cranial nerves", "spinal cord", "nerve", "muscle"]],
  ["physiology", ["physiology", "autonomic", "acid base", "electrolytes", "motility", "nmj", "neurotransmitter", "fluid"]],
  ["pathology", ["path", "oncology", "cell death", "inflammation", "healing", "adaptation", "metaplasia", "anemia", "coagulation", "platelets"]],
];

const firstMatch = (rules, tags) => {
  const has = new Set(tags);
  for (const [id, keys] of rules) if (keys.some((k) => has.has(k))) return id;
  return null;
};

// Microbiology asked about microbes themselves — how they are stained,
// built, grown and killed — rather than about an illness they cause. Every
// one of these would otherwise read as Infectious Diseases, which is where
// the question about the patient belongs, not the question about the agar.
const GENERAL_MICRO = /\b(gram stain|gram-positive organisms|gram-negative organisms|peptidoglycan|teichoic|lipopolysaccharide|endotoxin|exotoxin|bacterial (cell )?wall|capsule|endospore|spores?|flagell\w*|pili|fimbria\w*|plasmid|transformation|transduction|conjugation|lysogen\w*|obligate (aerobe|anaerobe)|facultative|catalase|coagulase|oxidase|urease|culture medium|agar|broth|sterilis\w*|steriliz\w*|disinfect\w*|autoclave|biofilm|quorum sensing|growth curve|capsid|viral envelope|minimum inhibitory)\b/i;
const MICRO_TAGS = ["micro", "bacteria", "virus", "fungi", "parasite", "gram positive", "gram negative", "stains"];

// "repro" on its own says which organs without saying whose. The question's
// own words do: a prostate question is male, a cervix question is female.
const MALE = /\b(prostate|testis|testicular|testes|scrotum|scrotal|penis|penile|sperm|epididym|vas deferens|seminal|erectile|varicocele|cryptorchid|BPH)\b/i;

function reproSystem(q) {
  const text = `${q.topic} ${q.q} ${q.explain || ""}`;
  return MALE.test(text) ? "male-repro" : "female-repro";
}

/**
 * Where one question is filed: { system, subject }, both always set.
 *
 * A question whose tags say nothing about an organ falls to the general
 * principles of whatever it is asked from, and one that says nothing at all
 * is Miscellaneous — asked from Pathophysiology, which is what a clinical
 * question with no discipline of its own is.
 */
export function fileQuestion(q) {
  let system = firstMatch(SYSTEM_RULES, q.tags);
  if (system === "repro") system = reproSystem(q);
  if (system === "infectious" && q.tags.some((t) => MICRO_TAGS.includes(t)) &&
      GENERAL_MICRO.test(`${q.topic} ${q.q}`)) system = "microbiology-gp";
  const subject = firstMatch(SUBJECT_RULES, q.tags) || "pathophysiology";
  return { system: system || "miscellaneous", subject };
}

/* ── names ───────────────────────────────────────────────────────────── */

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const SYSTEM_BY_ID = byId(SYSTEMS);
const SUBJECT_BY_ID = byId(SUBJECTS);

export const systemName = (id) => (isUz() ? SYSTEM_BY_ID[id]?.uz : SYSTEM_BY_ID[id]?.en) || id;
export const subjectName = (id) => (isUz() ? SUBJECT_BY_ID[id]?.uz : SUBJECT_BY_ID[id]?.en) || id;
/** The short form, for a chip that has to sit in a row with others. */
export const systemShort = (id) => (isUz() ? SYSTEM_BY_ID[id]?.short : SYSTEM_BY_ID[id]?.en) || id;
export const subjectShort = (id) => (isUz() ? SUBJECT_BY_ID[id]?.short : SUBJECT_BY_ID[id]?.en) || id;

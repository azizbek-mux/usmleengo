// Reading questions a teacher wrote in the simple format.
//
//   1. A 25-year-old woman has fatigue and pale conjunctivae. Most likely deficiency?
//   A) Iron
//   B) Vitamin B12
//   C) Folate
//   Answer: A
//   Explanation: Microcytic anemia in a menstruating woman.
//
//   2. Dementia, diarrhea and dermatitis = deficiency of vitamin ___
//   Answer: B3
//   Accept: niacin, vitamin b3
//
// Forgiving about the details: questions numbered "1." "1)" "Q1:"; options
// "A)" "A." "(a)" "a -"; the right one given by "Answer: B", "Correct: B",
// "Ans B", a "*" or "(correct)" after the option, or the option's own
// words; up to ten options. A question with no options is typed, and its
// "Answer:" is the answer. Pictures from Word and web pages come in as
// blocks of their own and belong to the question they sit under.
//
// No AI, by the owner's choice: what cannot be read is flagged, never
// guessed, and the teacher fixes it in the preview.
//
// Uzbek works the same way: "Savol 1.", "Javob: B", "To'g'ri javob: B",
// "Qabul: …", "Izoh: …", "Mavzu: …", and "(to'g'ri)" after an option. The
// apostrophe may be typed as ' ‘ ’ or ʻ — phones differ.

import { t } from "./i18n.js";

export const MAX_OPTIONS = 10;

const Q = "['‘’ʻ`]"; // the apostrophe in o' and g', however it was typed
const QUESTION = /^(?:(?:q(?:uestion)?|savol)\s*)?(\d{1,3})\s*[.):\]-]\s*(.*)$/i;
const OPTION = /^[([]?([a-j])\s*[.):\]-]\s*(.+)$/i;
const MARKED = new RegExp(`\\s*(?:\\*+|\\((?:correct|right|answer|to${Q}g${Q}ri)\\)|\\[(?:correct|right|answer|to${Q}g${Q}ri)\\]|✓|✔)\\s*$`, "i");
// "Answer: A", "Answer:A", "Ans B", "Key - C", "Javob: A"; but "Correct",
// "Right" and "To'g'ri" only with a colon, so a question that begins
// "Correct statement about…" is not taken for its own answer.
const ANSWER = new RegExp(
  `^(?:(?:answer|ans|key|javob)(?:\\s*[:.=-]\\s*|\\s+)|(?:correct|right|to${Q}g${Q}ri)(?:\\s+(?:answer|javob))?\\s*[:=-]\\s*)(.+)$`, "i");
const ACCEPT = /^(?:accept|also\s+accept|alternatives?|qabul(?:\s+qilinadi)?|muqobil)\s*[:=-]\s*(.+)$/i;
const EXPLAIN = /^(?:explanation|explain|rationale|why|reason|izoh|tushuntirish)\s*[:=-]\s*(.*)$/i;
const TOPIC = /^(?:topic|subject|mavzu|fan)\s*[:=-]\s*(.+)$/i;

/** One letter, A–J, as an option index; or null. */
function letterIndex(s) {
  const m = /^[([]?([a-j])[)\].]?$/i.exec(s.trim());
  return m ? m[1].toLowerCase().charCodeAt(0) - 97 : null;
}

function finish(q) {
  const out = {
    source: q.n,
    q: q.lines.join("\n").trim(),
    explain: q.explain.join("\n").trim(),
  };
  if (q.topic) out.topic = q.topic;
  if (q.image) out.image = q.image;
  const options = q.options.map((o) => o.text.trim());
  let problem = null;

  if (options.length) {
    out.type = "choice";
    out.options = options;
    let answer = q.options.findIndex((o) => o.marked);
    if (q.answer !== null) {
      const byLetter = letterIndex(q.answer);
      const byText = options.findIndex((o) => o.toLowerCase() === q.answer.trim().toLowerCase());
      if (byLetter !== null) answer = byLetter;
      else if (byText >= 0) answer = byText;
      else answer = -2; // an answer that names no option
    }
    out.answer = answer;
    if (options.length < 2) problem = t("Only one option — a question needs at least two.", "Faqat bitta variant — savolda kamida ikkita bo'lishi kerak.");
    else if (options.length > MAX_OPTIONS) problem = t(`More than ${MAX_OPTIONS} options.`, `${MAX_OPTIONS} tadan ortiq variant.`);
    else if (answer === -2) problem = t(`The answer “${q.answer}” isn’t one of the options.`, `«${q.answer}» javobi variantlar orasida yo'q.`);
    else if (answer < 0) problem = t("No right answer marked.", "To'g'ri javob belgilanmagan.");
    else if (answer >= options.length) {
      problem = t(`The answer ${String.fromCharCode(65 + answer)} has no option.`, `${String.fromCharCode(65 + answer)} javobiga mos variant yo'q.`);
    }
  } else {
    out.type = "typed";
    out.answer = (q.answer || "").trim();
    out.accept = [out.answer, ...q.accept].map((a) => a.trim()).filter(Boolean);
    if (!out.answer) problem = t("No options, and no answer to type.", "Variantlar ham, yoziladigan javob ham yo'q.");
  }
  if (!out.q && !out.image) problem = problem || t("The question has no words.", "Savol matni yo'q.");
  out.problem = problem;
  return out;
}

/**
 * Questions from a file's contents.
 *
 *   blocks — [{ text }] and [{ image }], in document order; plain text is
 *            one block. Word's automatic numbering arrives already written
 *            out as "1." and "A)" (see qfiles.js).
 *
 * Returns { questions: [{ type, q, options?, answer, accept?, explain,
 * image?, problem }], stray } — `stray` counts lines before the first
 * question that were not read as anything.
 */
export function parseQuestions(blocks) {
  const questions = [];
  let q = null;
  let part = "question"; // question | options | answer | explain
  let pendingImage = null;
  let stray = 0;

  const start = (n, text) => {
    if (q) questions.push(finish(q));
    q = { n, lines: text ? [text] : [], options: [], answer: null, accept: [], explain: [], topic: "", image: pendingImage };
    pendingImage = null;
    part = "question";
  };

  for (const block of blocks) {
    if (block.image) {
      // A picture belongs to the question it sits under; one before any
      // question waits for the first.
      if (q && !q.image) q.image = block.image;
      else if (!q) pendingImage = block.image;
      continue;
    }
    for (const raw of String(block.text || "").split(/\r?\n/)) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!line) continue;

      const qm = QUESTION.exec(line);
      if (qm) {
        // "9. Topic: Renal" names the topic; the question follows.
        const tm = TOPIC.exec(qm[2]);
        start(Number(qm[1]), tm ? "" : qm[2]);
        if (tm) q.topic = tm[1].trim();
        continue;
      }
      if (!q) { stray++; continue; }

      let m;
      if ((m = ANSWER.exec(line))) { q.answer = m[1].trim(); part = "answer"; continue; }
      if ((m = ACCEPT.exec(line))) { q.accept.push(...m[1].split(/[,;]/)); continue; }
      if ((m = EXPLAIN.exec(line))) { if (m[1]) q.explain.push(m[1]); part = "explain"; continue; }
      if ((m = TOPIC.exec(line))) { q.topic = m[1].trim(); continue; }

      const om = part !== "explain" ? OPTION.exec(line) : null;
      // An option letter must come next in order — A, then B — so a sentence
      // that happens to start "a. " in the middle is not taken for one.
      if (om && om[1].toLowerCase().charCodeAt(0) - 97 === q.options.length) {
        const marked = MARKED.test(om[2]);
        q.options.push({ text: om[2].replace(MARKED, ""), marked });
        part = "options";
        continue;
      }

      if (part === "explain") q.explain.push(line);
      else if (part === "options" && q.options.length) q.options[q.options.length - 1].text += ` ${line}`;
      else if (part === "question") q.lines.push(line);
      else q.explain.push(line);
    }
  }
  if (q) questions.push(finish(q));
  return { questions, stray };
}

/** The example a teacher can copy. */
export const FORMAT_EXAMPLE = `1. A 25-year-old woman has fatigue and pale conjunctivae. Most likely deficiency?
A) Iron
B) Vitamin B12
C) Folate
D) Zinc
Answer: A
Explanation: Microcytic anemia in a menstruating woman.

2. Dementia, diarrhea and dermatitis = deficiency of vitamin ___
Answer: B3
Accept: niacin, vitamin b3
Explanation: Pellagra — the three D's.

3. First-line drug for absence seizures?
A) Phenytoin
B) Ethosuximide *
C) Carbamazepine`;

/** The same example in Uzbek, with the Uzbek keywords. */
export const FORMAT_EXAMPLE_UZ = `1. 25 yoshli ayolda holsizlik va konyunktivalar rangparligi kuzatiladi. Eng ehtimoliy yetishmovchilik?
A) Temir
B) B12 vitamini
C) Foliy kislotasi
D) Rux
Javob: A
Izoh: Hayz ko'radigan ayolda mikrotsitar anemiya.

2. Demensiya, diareya va dermatit = ___ vitamini yetishmovchiligi
Javob: B3
Qabul: niatsin, vitamin b3
Izoh: Pellagra — uchta «D».

3. Absans tutqanoqlarida birlamchi preparat?
A) Fenitoin
B) Etosuksimid *
C) Karbamazepin`;

/** The example in the app's language. */
export const formatExample = () => t(FORMAT_EXAMPLE, FORMAT_EXAMPLE_UZ);

// Reading a teacher's question file: the simple format and the ways people
// actually write it. What cannot be read must be flagged, never guessed.

const F = await import(new URL("../src/lib/qformat.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};
const read = (text) => F.parseQuestions([{ text }]).questions;

console.log("\nthe example");
const ex = read(F.FORMAT_EXAMPLE);
check("three questions", ex.length === 3, String(ex.length));
check("the first: four options, A right, with its explanation",
  ex[0].type === "choice" && ex[0].options.length === 4 && ex[0].answer === 0 && ex[0].explain.startsWith("Microcytic") && !ex[0].problem);
check("the second: typed, with what else to accept",
  ex[1].type === "typed" && ex[1].answer === "B3" && ex[1].accept.join() === "B3,niacin,vitamin b3" && !ex[1].problem);
check("the third: the right one marked with a star", ex[2].answer === 1 && ex[2].options[1] === "Ethosuximide" && !ex[2].problem);

console.log("\nhow people write it");
let q = read(`Q1: Which is a loop diuretic?\n(a) Furosemide\n(b) HCTZ\nCorrect: a`)[0];
check("Q1:, (a), Correct:", q.answer === 0 && q.options.length === 2 && !q.problem);
q = read(`1) Drug of choice for absence seizures\na. Phenytoin\nb. Ethosuximide\nAnswer:B`)[0];
check("1), a., Answer:B with no space", q.answer === 1 && !q.problem);
q = read(`3. Iron deficiency anemia is\nA - Microcytic\nB - Macrocytic\nAns A`)[0];
check("A -, and Ans without a colon", q.answer === 0 && !q.problem);
q = read(`4. Most common cause of iron deficiency in women?\nA) Diet\nB) Menstruation\nAnswer: Menstruation`)[0];
check("the answer given in the option's own words", q.answer === 1 && !q.problem);
q = read(`5. Pick one\nA) One (correct)\nB) Two`)[0];
check("(correct) after the option", q.answer === 0 && q.options[0] === "One");
q = read(`6. Ten options\nA) a\nB) b\nC) c\nD) d\nE) e\nF) f\nG) g\nH) h\nI) i\nJ) j\nAnswer: J`)[0];
check("up to ten options, J the last", q.options.length === 10 && q.answer === 9 && !q.problem);
q = read(`7. A 60-year-old man
with crushing chest pain
radiating to the left arm. Diagnosis?
A) Myocardial
infarction
B) Pericarditis
Answer: A
Explanation: Classic.
Troponin rises in 3-4 hours.`)[0];
check("a question over several lines", q.q.split("\n").length === 3);
check("an option over two lines", q.options[0] === "Myocardial infarction");
check("an explanation over two lines", q.explain.split("\n").length === 2);
q = read(`8. Correct statement about the SA node?\nA) It is the pacemaker\nB) It is in the ventricle\nAnswer: A`)[0];
check("a question that begins with “Correct” is not its own answer", q.q.startsWith("Correct statement") && q.answer === 0);
q = read(`9. Topic: Renal\nWhich acts on the loop of Henle?\nA) Furosemide\nB) Spironolactone\nAnswer: A`)[0];
check("a topic line", q.topic === "Renal" && q.q === "Which acts on the loop of Henle?");

console.log("\nwhat must be flagged");
check("no right answer marked", read(`1. Q?\nA) x\nB) y`)[0].problem === "No right answer marked.");
check("an answer letter with no option", /has no option/.test(read(`1. Q?\nA) x\nB) y\nAnswer: D`)[0].problem));
check("an answer that names no option", /isn’t one of the options/.test(read(`1. Q?\nA) x\nB) y\nAnswer: Z-drug`)[0].problem));
check("a single option", /at least two/.test(read(`1. Q?\nA) only\nAnswer: A`)[0].problem));
check("neither options nor an answer", /no answer/.test(read(`1. What?`)[0].problem));
check("nothing flagged is ever guessed", read(`1. Q?\nA) x\nB) y`)[0].answer === -1);

console.log("\neverything else");
const withIntro = F.parseQuestions([{ text: "Cardio quiz, week 3\nName: ______\n1. Q?\nA) x\nB) y\nAnswer: B" }]);
check("a title before the first question is skipped and counted", withIntro.questions.length === 1 && withIntro.stray === 2);
const pic = { name: "image1.png" };
const pics = F.parseQuestions([{ text: "1. Identify the cell" }, { image: pic }, { text: "A) Neutrophil\nB) Eosinophil\nAnswer: A\n2. Next?\nA) x\nB) y\nAnswer: A" }]);
check("a picture belongs to the question it sits under", pics.questions[0].image === pic && !pics.questions[1].image);
const before = F.parseQuestions([{ image: pic }, { text: "1. What is shown?\nA) x\nB) y\nAnswer: A" }]);
check("a picture before any question goes to the first", before.questions[0].image === pic);
check("a picture question needs no words", !F.parseQuestions([{ text: "1." }, { image: pic }, { text: "A) x\nB) y\nAnswer: B" }]).questions[0].problem);
check("an empty file has no questions", read("").length === 0 && read("just some text").length === 0);
check("Windows line endings", read("1. Q?\r\nA) x\r\nB) y\r\nAnswer: B")[0].answer === 1);

console.log("\nwritten in Uzbek");
const uz = read(F.FORMAT_EXAMPLE_UZ);
check("the Uzbek example reads as three questions, none flagged", uz.length === 3 && uz.every((q) => !q.problem), JSON.stringify(uz.map((q) => q.problem)));
check("Javob: gives the answer", uz[0].answer === 0 && uz[0].options.length === 4);
check("Izoh: gives the explanation", uz[0].explain === "Hayz ko'radigan ayolda mikrotsitar anemiya.");
check("Qabul: gives the other spellings", uz[1].type === "typed" && uz[1].accept.includes("niatsin") && uz[1].accept.includes("B3"));
check("a * marks the right option in Uzbek too", uz[2].answer === 1);
check("Savol 1. numbers a question", read("Savol 1. Qaysi biri?\nA) x\nB) y\nJavob: B")[0].answer === 1);
check("To'g'ri javob: with any apostrophe", ["'", "‘", "’", "ʻ"].every((a) => read(`1. Q?\nA) x\nB) y\nTo${a}g${a}ri javob: A`)[0].answer === 0));
check("(to'g'ri) after an option marks it", read("1. Q?\nA) x\nB) y (to'g'ri)")[0].answer === 1);
check("Mavzu: names the topic", read("1. Q?\nA) x\nB) y\nJavob: A\nMavzu: Kardiologiya")[0].topic === "Kardiologiya");
check("a question that begins \"To'g'ri\" is not its own answer", read("1. To'g'ri fikrni tanlang\nA) x\nB) y\nJavob: A")[0].q === "To'g'ri fikrni tanlang");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

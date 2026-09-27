// The "Share score" message.

const S = await import(new URL("../src/lib/shareText.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const LINK = "https://t.me/usmleengo_bot/study";
const BOLD = "𝘂𝘀𝗺𝗹𝗲𝗲𝗻𝗴𝗼";

console.log("\nbold letters");
check("usmleengo in bold letters", S.boldText("usmleengo") === BOLD);
check("capitals and digits too", S.boldText("A1") === "𝗔𝟭");
check("anything else is left alone", S.boldText("9/10 — 90%") === "𝟵/𝟭𝟬 — 𝟵𝟬%");

console.log("\nwhere the round came from");
check("several categories", S.roundScope("3 categories") === "from 3 categories");
check("no choice at all", S.roundScope("Random") === "from all categories" && S.roundScope("") === "from all categories");
check("one category", S.roundScope("cardio") === "in cardio");
check("picture categories by their full names", S.roundScope("histo") === "in histology" && S.roundScope("radio") === "in radiology");
check("a searched topic", S.roundScope("Addison disease") === "in Addison disease");

console.log("\nthe message");
const m = S.shareMessage({ correct: 9, total: 10, label: "3 categories", streak: 5,
  rank: { place: 12, total: 340 }, bankSize: 6317, link: LINK });
const lines = m.split("\n");
check("opens with the score and the name in bold",
  lines[0] === `🎯 I scored 9/10 — 90% on ${BOLD} from 3 categories!`, lines[0]);
check("then the rank", lines[1] === "🏆 I'm ranked #12 of 340 now", lines[1]);
check("then the streak", lines[2] === "🔥 5-day streak", lines[2]);
check("then an invitation", lines[4] === "🩺 6300+ free USMLE quizzes. You can try now 👇", lines[4]);
check("and the link, last, on its own line", lines[lines.length - 1] === LINK);

const perfect = S.shareMessage({ correct: 10, total: 10, label: "cardio", rank: { place: 1, total: 57 }, bankSize: 6317, link: LINK });
check("a perfect round says so", perfect.startsWith(`💯 Perfect round! I scored 10/10 — 100% on ${BOLD} in cardio!`), perfect.split("\n")[0]);
check("first place gets a crown", perfect.includes("👑 I'm #1 of 57 on the leaderboard right now"));
check("second and third get medals",
  S.shareMessage({ correct: 5, total: 10, rank: { place: 2, total: 9 }, link: LINK }).includes("🥈 I'm ranked #2 of 9 now") &&
  S.shareMessage({ correct: 5, total: 10, rank: { place: 3, total: 9 }, link: LINK }).includes("🥉 I'm ranked #3 of 9 now"));
check("a big board reads with a thousands separator",
  S.shareMessage({ correct: 5, total: 10, rank: { place: 88, total: 2300 }, link: LINK }).includes("#88 of 2,300"));

const plain = S.shareMessage({ correct: 3, total: 10, streak: 1, rank: null, bankSize: 6317, link: LINK });
check("a hard round still reads well", plain.startsWith(`📖 I scored 3/10 — 30% on ${BOLD} from all categories!`));
check("no rank line without a rank", !plain.includes("ranked") && !plain.includes("leaderboard"));
check("no streak line for a single day", !plain.includes("streak"));
check("nobody is told they are #1 of 1",
  !S.shareMessage({ correct: 5, total: 10, rank: { place: 1, total: 1 }, link: LINK }).includes("#1"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

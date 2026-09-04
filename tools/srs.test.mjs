// Checks the scheduler against Anki's documented behaviour on its default
// preset. Every expected number here comes from Anki's own defaults —
// 1m/10m learning steps, 1d graduating, 4d easy, 2.50 starting ease,
// -0.15 hard / +0.15 easy / -0.20 lapse, 1.30 floor, 1.2 hard multiplier,
// 1.3 easy bonus — not from what this implementation happens to produce.

const SRC = new URL("../src/lib/", import.meta.url).href;
const S = await import(SRC + "srs.js");
const { NEW, LEARNING, REVIEW, RELEARNING, DEFAULTS, answer, dayNumber, formatInterval,
        freshCard, minuteNumber, preview } = S;

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};
const near = (a, b, tol = 0.001) => Math.abs(a - b) <= tol;

// A fixed instant, safely inside a day (14:00 local) so rollover is not in play.
const T0 = new Date(2026, 8, 4, 14, 0, 0).getTime();
const at = (ms) => ({ now: ms });
const MIN = 60000, DAY = 86400000;

/* ── the learning phase ─────────────────────────────────────────────────── */

console.log("\nlearning phase (steps 1m, 10m)");

let c = { ...freshCard(), key: 7 };
check("a new card starts in the new state", c.state === NEW && c.ivl === 0);

// Anki's row for a brand-new card on the default preset is 1m / 6m / 10m / 4d.
// Good means "I finished the first step", so it schedules the SECOND one.
const newRow = preview(c, at(T0));
check("a new card shows Anki's own button row",
      formatInterval(newRow.again) === "1m" && formatInterval(newRow.hard) === "6m" &&
      formatInterval(newRow.good) === "10m" && formatInterval(newRow.easy) === "4d",
      Object.entries(newRow).map(([k, v]) => `${k} ${formatInterval(v)}`).join(", "));

check("Again on a new card waits one minute",
      (() => { const r = answer(c, "again", at(T0));
               return r.state === LEARNING && r.step === 0 && r.due === minuteNumber(T0) + 1; })());

check("Hard on a new card waits the average of the two steps",
      (() => { const h = answer(c, "hard", at(T0));
               return h.state === LEARNING && h.due === minuteNumber(T0) + 6; })(),
      "(1m and 10m average to 5.5, rounded up)");

let a = answer(c, "good", at(T0));
check("Good on a new card advances to the 10 minute step",
      a.state === LEARNING && a.step === 1 && a.due === minuteNumber(T0) + 10,
      `state ${a.state} step ${a.step} due+${a.due - minuteNumber(T0)}`);

let b = answer(a, "good", at(T0 + 10 * MIN));
check("Good off the last step graduates to a 1 day interval",
      b.state === REVIEW && b.ivl === DEFAULTS.graduatingInterval, `ivl ${b.ivl}`);
check("a graduated card keeps the starting ease",
      near(b.ease, DEFAULTS.startingEase), `ease ${b.ease}`);
check("its due date is today plus the interval",
      b.due === dayNumber(T0 + 10 * MIN) + b.ivl);

check("Again part-way through learning drops back to the first step",
      (() => { const r = answer(a, "again", at(T0 + 10 * MIN));
               return r.state === LEARNING && r.step === 0 &&
                      r.due === minuteNumber(T0 + 10 * MIN) + 1; })());

check("Easy on a new card skips learning entirely, at 4 days",
      (() => { const e = answer(c, "easy", at(T0));
               return e.state === REVIEW && e.ivl === DEFAULTS.easyInterval; })());

/* ── review scheduling ──────────────────────────────────────────────────── */

console.log("\nreview scheduling (ease 2.50)");

const today = dayNumber(T0);
const review = { key: 3, state: REVIEW, step: 0, ease: 2.5, ivl: 10, due: today, lapses: 0, reps: 5 };

const good = answer(review, "good", at(T0));
check("Good multiplies the interval by the ease",
      Math.abs(good.ivl - 25) <= 4, `ivl ${good.ivl}, expected ~25 before fuzz`);
check("Good leaves the ease alone", near(good.ease, 2.5), `ease ${good.ease}`);

const hard = answer(review, "hard", at(T0));
check("Hard uses the 1.2 multiplier, not the ease",
      Math.abs(hard.ivl - 12) <= 3, `ivl ${hard.ivl}, expected ~12`);
check("Hard drops the ease by 0.15", near(hard.ease, 2.35), `ease ${hard.ease}`);

const easy = answer(review, "easy", at(T0));
check("Easy applies the 1.3 bonus on top of the ease",
      Math.abs(easy.ivl - 32) <= 5, `ivl ${easy.ivl}, expected ~32`);
check("Easy raises the ease by 0.15", near(easy.ease, 2.65), `ease ${easy.ease}`);

check("the three passing intervals stay strictly ordered",
      hard.ivl < good.ivl && good.ivl < easy.ivl,
      `${hard.ivl} / ${good.ivl} / ${easy.ivl}`);

/* ── lapses ─────────────────────────────────────────────────────────────── */

console.log("\nlapses");

const lapsed = answer(review, "again", at(T0));
check("a lapse sends the card to relearning", lapsed.state === RELEARNING && lapsed.step === 0);
check("relearning waits 10 minutes", lapsed.due === minuteNumber(T0) + DEFAULTS.relearnSteps[0]);
check("the ease drops by 0.20", near(lapsed.ease, 2.3), `ease ${lapsed.ease}`);
check("the interval collapses to the 1 day minimum", lapsed.ivl === 1, `ivl ${lapsed.ivl}`);
check("the lapse is counted", lapsed.lapses === 1);

const relearned = answer(lapsed, "good", at(T0 + 11 * MIN));
check("Good out of relearning returns the card to review",
      relearned.state === REVIEW && relearned.ivl >= 1, `ivl ${relearned.ivl}`);

let floored = { ...review, ease: 1.35 };
floored = answer(floored, "hard", at(T0));
check("ease never falls below 1.30", near(floored.ease, 1.3), `ease ${floored.ease}`);

/* ── overdue credit ─────────────────────────────────────────────────────── */

console.log("\noverdue credit");

const overdue = { ...review, due: today - 20 };           // answered 20 days late
const onTime = answer(review, "good", at(T0));
const late = answer(overdue, "good", at(T0));
check("answering late lengthens the next interval more than answering on time",
      late.ivl > onTime.ivl, `${late.ivl} vs ${onTime.ivl}`);

/* ── the button labels are the intervals the card actually gets ─────────── */

console.log("\npreview matches the answer");

let mismatches = 0;
for (const card of [c, a, b, review, { ...review, ivl: 90, ease: 1.8 }, lapsed]) {
  const p = preview(card, at(T0));
  for (const grade of ["again", "hard", "good", "easy"]) {
    const got = answer(card, grade, at(T0));
    const asMinutes = got.state === REVIEW ? got.ivl * 1440 : got.due - minuteNumber(T0);
    if (p[grade] !== asMinutes) mismatches++;
  }
}
check("every button's label equals what pressing it does", mismatches === 0,
      `${mismatches} mismatched`);

/* ── the day rolls over at 4am ──────────────────────────────────────────── */

console.log("\nday rollover");

const at1am = new Date(2026, 8, 5, 1, 0, 0).getTime();
const at5am = new Date(2026, 8, 5, 5, 0, 0).getTime();
check("1am still counts as the previous day", dayNumber(at1am) === dayNumber(T0),
      `${dayNumber(at1am)} vs ${dayNumber(T0)}`);
check("5am is a new day", dayNumber(at5am) === dayNumber(T0) + 1);

/* ── labels ─────────────────────────────────────────────────────────────── */

console.log("\ninterval labels");
const labels = [[1, "1m"], [10, "10m"], [1440, "1d"], [1440 * 4, "4d"],
                [1440 * 45, "1.5mo"], [1440 * 400, "1.1y"]];
let badLabel = null;
for (const [mins, want] of labels) if (formatInterval(mins) !== want) badLabel = `${mins} -> ${formatInterval(mins)} not ${want}`;
check("intervals print in Anki's units", !badLabel, badLabel || "");

/* ── daily limits and the queue ─────────────────────────────────────────── */

console.log("\ndaily limits");

const D = await import(SRC + "deck.js");
const pool = Array.from({ length: 200 }, (_, i) => ({ i, yield: i < 50 ? "high" : "medium" }));
let deck = D.rollDay(structuredClone(D.emptyDeck), dayNumber(T0));
deck = D.setConfig(deck, { newPerDay: 5, revPerDay: 3 });

let counts = D.queueCounts(deck, pool, T0);
check("only the day's new allowance is offered", counts.newCount === 5, `${counts.newCount}`);
check("the rest are reported as waiting", counts.newRemaining === 200);

// introduce the day's five new cards
let introduced = 0;
for (let n = 0; n < 5; n++) {
  const card = D.nextCard(deck, pool, T0);
  if (!card) break;
  deck = D.answerCard(deck, card.i, "easy", T0);   // Easy graduates straight to review
  introduced++;
}
check("five new cards can be introduced", introduced === 5, `${introduced}`);
counts = D.queueCounts(deck, pool, T0);
check("the new count is then exhausted for the day", counts.newCount === 0, `${counts.newCount}`);
check("nothing new is served once the limit is hit", D.nextCard(deck, pool, T0) === null);

// four days later those five are due, but the review limit is three
const T4 = T0 + 4 * DAY;
deck = D.rollDay(deck, dayNumber(T4));
counts = D.queueCounts(deck, pool, T4);
check("the review limit caps what is offered", counts.dueCount === 3, `${counts.dueCount}`);
check("the true backlog is still reported", counts.reviewBacklog === 5, `${counts.reviewBacklog}`);
check("new cards are available again the next day", counts.newCount === 5, `${counts.newCount}`);

/* ── learning cards are never held back by a limit ──────────────────────── */

let deck2 = D.setConfig(D.rollDay(structuredClone(D.emptyDeck), dayNumber(T0)), { newPerDay: 1, revPerDay: 0 });
const first = D.nextCard(deck2, pool, T0);
deck2 = D.answerCard(deck2, first.i, "good", T0);        // now in learning, due in 1 minute
const c2 = D.queueCounts(deck2, pool, T0 + 2 * MIN);
check("a card in learning is counted even before its minute arrives",
      c2.learnCount === 1, `learnCount ${c2.learnCount}`);
check("and it is servable, because Anki shows learning cards slightly early",
      c2.readyNow === 1 && D.nextCard(deck2, pool, T0 + 2 * MIN)?.i === first.i,
      `readyNow ${c2.readyNow}`);
const c3 = D.queueCounts(deck2, pool, T0 + 11 * MIN);
check("once due, it is still available past both daily limits",
      c3.learnCount === 1 && D.nextCard(deck2, pool, T0 + 11 * MIN)?.i === first.i);

/* ── storage round trip, including the old Leitner format ───────────────── */

console.log("\nstorage");

globalThis.localStorage = (() => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
})();

let rich = structuredClone(D.emptyDeck);
rich = D.setConfig(rich, { newPerDay: 40, revPerDay: 500 });
rich = D.rollDay(rich, dayNumber(T0));
for (let i = 0; i < 300; i++) rich = D.answerCard(rich, i, ["again", "hard", "good", "easy"][i % 4], T0);
D.saveDeck(rich);
const back = D.loadDeckLocal();
check("every card survives the round trip",
      Object.keys(back.cards).length === Object.keys(rich.cards).length,
      `${Object.keys(back.cards).length}`);
check("config survives", back.config.newPerDay === 40 && back.config.revPerDay === 500);
check("daily counters survive", back.newDone === rich.newDone && back.revDone === rich.revDone);
const sample = Object.keys(rich.cards)[7];
check("a card's ease, interval, due and lapses all survive",
      back.cards[sample].state === rich.cards[sample].state &&
      near(back.cards[sample].ease, rich.cards[sample].ease) &&
      back.cards[sample].ivl === rich.cards[sample].ivl &&
      back.cards[sample].due === rich.cards[sample].due &&
      back.cards[sample].lapses === rich.cards[sample].lapses,
      JSON.stringify(back.cards[sample]));

// a deck written by the previous Leitner build
localStorage.setItem("usmleengo_english_v1", "1|42|20700|0:1:fz1;5:4:fz9;9:0:fz0");
const migrated = D.loadDeckLocal();
check("a deck from the box system is carried over, not discarded",
      Object.keys(migrated.cards).length === 3 && migrated.reviews === 42,
      `${Object.keys(migrated.cards).length} cards, ${migrated.reviews} reviews`);
check("boxes become review cards with the interval that box meant",
      migrated.cards[0].state === REVIEW && migrated.cards[0].ivl === 1 &&
      migrated.cards[5].ivl === 16,
      JSON.stringify(migrated.cards[5]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

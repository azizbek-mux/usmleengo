// Progress persistence.
//
// Telegram CloudStorage is the source of truth when available (it follows the
// user across devices and costs nothing). localStorage is both the offline
// fallback and a synchronous cache so the first paint never waits on a
// round-trip.

import { readOwn, scoped, unlabelledStart } from "./account.js";
import { cloudAvailable, cloudGet, cloudGetChunked, cloudSet, cloudSetChunked } from "./telegram.js";
import { answerPoints, dayIndex, tappedPoints } from "./rating.js";
import { PACE_MAX_MS, PACE_MIN_MS } from "./scorecard.js";
import { SUBJECTS, SYSTEMS } from "./taxonomy.js";

const SYSTEM_IDS = new Set(SYSTEMS.map((x) => x.id));
const SUBJECT_IDS = new Set(SUBJECTS.map((x) => x.id));

const KEY = "usmle_drops_v1";

/** Bookmarks kept. Generous, and a bound on what one list can cost in cloud storage. */
export const SAVED_MAX = 500;

export const emptyState = {
  // The study tab last used, "english" or "quiz", so the app reopens there.
  // null until one is chosen; the app then opens on the quizzes.
  section: null,
  // Which question formats to serve: "binary", "gap" or "random".
  // null until chosen on the Quiz tab, which serves the mix meanwhile.
  qtype: null,
  // Which palette to paint. "auto" follows Telegram until the user taps the
  // sun or the moon, which pins "light" or "dark" for good.
  theme: "auto",
  // How many questions the user wants per session (2-100).
  count: 10,
  // What the user has narrowed the bank to, one list per axis. Empty means
  // the whole bank on that axis; the two are combined with "and", so
  // Cardiovascular + Pharmacology is heart drugs and nothing else.
  systems: [],
  subjects: [],
  // The rating: the running total of points, in hundredths so that answers
  // add exactly. It never goes below 0. See rating.js.
  points: 0,
  streak: 0,
  best: 0,
  lastDay: null,
  answered: 0,
  correct: 0,
  // seen[id] = [timesCorrect, timesWrong, last] — drives the spaced-repetition
  // weight, and `last` (1 right, 0 wrong) says whether the question is still
  // among the player's mistakes. Entries written before `last` existed have
  // only the two counts; see isMistake in review.js.
  seen: {},
  // Questions the player bookmarked, by id, newest first.
  saved: [],
  // Time spent on correct answers, per question type: [total ms, count].
  // Only correct answers, and each type kept apart — see rating.js for why.
  timing: { binary: [0, 0], gap: [0, 0] },
  // The how-to cards have been seen (or skipped); they are shown once.
  introSeen: false,
  // "en" or "uz". null until chosen — on the first how-to card, or in Me —
  // and the app is in English meanwhile.
  lang: null,
};

/**
 * Someone who has never studied here: no answers and no day studied —
 * a day of flashcards sets lastDay too. They get the how-to cards.
 */
export const isNewPlayer = (state) => !state.introSeen && !state.lastDay && !state.answered;

export function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysBetween(a, b) {
  const msPerDay = 86400000;
  return Math.round((new Date(b) - new Date(a)) / msPerDay);
}

function merge(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return null;
    const merged = { ...emptyState, ...parsed, seen: parsed.seen || {} };
    // Guard against a corrupted or out-of-range stored value.
    merged.count = Math.min(100, Math.max(2, Number(merged.count) || 10));
    if (!["binary", "gap", "random"].includes(merged.qtype)) merged.qtype = null;
    if (!["auto", "light", "dark"].includes(merged.theme)) merged.theme = "auto";
    if (!["english", "quiz"].includes(merged.section)) merged.section = null;
    merged.introSeen = parsed.introSeen === true;
    if (!["en", "uz"].includes(merged.lang)) merged.lang = null;
    // Tags can disappear when the bank is re-authored, so anything unknown is
    // dropped on read rather than left to filter a round down to nothing.
    merged.timing = cleanTiming(parsed.timing);
    // Progress saved before points were kept has none; they are estimated once
    // from what was kept, and counted exactly from there. Fields the app no
    // longer keeps (XP, and the credit that briefly replaced it) are dropped.
    merged.points = Number.isInteger(parsed.points) && parsed.points >= 0 ? parsed.points : legacyPoints(merged);
    delete merged.xp;
    delete merged.credit;
    delete merged.fluent;
    merged.subjects = Array.isArray(parsed.subjects)
      ? [...new Set(parsed.subjects.filter((t) => typeof t === "string" && t))].slice(0, 24)
      : [];
    merged.saved = Array.isArray(parsed.saved)
      ? [...new Set(parsed.saved.filter((id) => typeof id === "string" && id))].slice(0, SAVED_MAX)
      : [];
    return merged;
  } catch {
    return null;
  }
}

/**
 * Points for progress made before points were kept, from what was: how many
 * answers were right, how many were timed as tapped and as typed, and how
 * long they took on average. Every wrong answer is taken as a tapped one, and
 * the typed ones as being in the proportion the timings show. It is an
 * estimate, made once; the very next answer is counted exactly.
 */
export function legacyPoints(state) {
  const answered = Math.max(0, Number(state.answered) || 0);
  const correct = Math.min(answered, Math.max(0, Number(state.correct) || 0));
  const t = cleanTiming(state.timing);
  const timed = t.binary[1] + t.gap[1];
  const gapShare = timed ? t.gap[1] / timed : 0;
  const rightGap = Math.round(correct * gapShare);
  const rightTap = correct - rightGap;
  const wrongTap = (answered - correct) * (1 - gapShare);
  // A right answer at the average time, as the average answer; with no time
  // kept, at ten seconds.
  const avg = ([ms, n]) => (n ? ms / n / 1000 : 10);
  const total = rightTap * tappedPoints(avg(t.binary)) + rightGap * 1.5 * tappedPoints(avg(t.gap)) - wrongTap * 8;
  return Math.max(0, Math.round(100 * total));
}

// A blank first paint - this account has nothing on the phone yet - lasts
// until the cloud copy has been read. Saves in that window stay local: the
// account's real progress is in the cloud, and a blank state sent up there
// would replace it. Decided once, on the first read: loadLocal runs again
// later, when a save has long since made the phone's copy exist.
let blankStart = null;
let cloudRead = false;

/**
 * Synchronous read for first paint. It reads this Telegram account's own copy
 * - see account.js for why the key carries the account.
 */
export function loadLocal() {
  try {
    if (blankStart === null) blankStart = unlabelledStart(KEY);
    return merge(readOwn(KEY)) || { ...emptyState };
  } catch {
    return { ...emptyState };
  }
}

/**
 * Async read that prefers whichever copy has more answers. Cloud and local can
 * diverge if the user played offline on one device, and "most progress wins"
 * is the behaviour that never loses a streak.
 *
 * There are three places progress can live: the local copy already painted,
 * the chunked cloud copy, and the single-value cloud copy written by versions
 * of the app from before chunking existed. All three are compared, so an
 * upgrading user keeps what they had and a torn chunked read can never drag
 * someone backwards.
 */
export async function loadRemote(localState) {
  if (!cloudAvailable) return localState;

  // Only a reply counts as having read the cloud. If it never came, a blank
  // start stays off the cloud for the rest of the session rather than
  // overwriting a copy that could not be looked at.
  let replied = false;
  try {
    const [legacy, chunked] = await Promise.all([
      cloudGet([KEY]).then((res) => { replied = res !== null; return res?.[KEY]; }),
      cloudGetChunked(KEY),
    ]);

    let best = localState;
    // Chunked is compared last so it wins a tie — it is the copy still being
    // written, and the legacy key stops being updated after this version.
    for (const raw of [legacy, chunked]) {
      const candidate = merge(raw);
      if (candidate && candidate.answered >= best.answered) best = candidate;
    }
    return best;
  } finally {
    if (replied) cloudRead = true;
  }
}

export function save(state) {
  const json = JSON.stringify(state);
  try {
    localStorage.setItem(scoped(KEY), json);
  } catch {
    /* private mode / quota — cloud may still succeed */
  }
  if (blankStart && !cloudRead) return;
  // Fire-and-forget: a failed cloud write must never block the UI.
  //
  // Chunked, because `seen` gains an entry for every question answered and
  // crosses CloudStorage's 4096-character ceiling at 125 of them (measured).
  // Past that an unchunked write fails silently: nothing is lost on the
  // device in use, but progress quietly stops following the user to another.
  cloudSetChunked(KEY, json);
}

/**
 * Roll the daily streak forward. Returns the state plus a flag so the UI can
 * celebrate only on the day the streak actually advances.
 */
export function touchStreak(state) {
  const t = today();
  if (state.lastDay === t) return { state, advanced: false };

  const gap = state.lastDay ? daysBetween(state.lastDay, t) : null;
  const streak = gap === 1 ? state.streak + 1 : 1;

  return {
    state: {
      ...state,
      streak,
      best: Math.max(state.best, streak),
      lastDay: t,
    },
    advanced: true,
  };
}

const pair = (p) => (Array.isArray(p) && p.length === 2 && p.every((n) => Number.isFinite(n) && n >= 0)
  ? [Math.round(p[0]), Math.round(p[1])] : [0, 0]);

/** Timing read back from storage, reset to zero if it is not what we wrote. */
function cleanTiming(raw) {
  return { binary: pair(raw?.binary), gap: pair(raw?.gap) };
}

/**
 * Record one answer: what it earns goes into the points, and never takes the
 * total below 0 (see rating.answerPoints).
 *
 * `elapsedMs` is how long the question was on screen before it was answered.
 * It is kept only for correct answers, and clamped: a question left open
 * while the phone sat in a pocket would otherwise count as a ten-minute
 * answer, and a stray double-tap as an impossible one.
 */
export function record(state, question, wasCorrect, elapsedMs) {
  const [c, w] = state.seen[question.id] || [0, 0];
  const timing = cleanTiming(state.timing);
  // An answer whose time is not known counts as the slowest there is, so
  // every right answer is timed and the totals below stay in step.
  const ms = Number.isFinite(elapsedMs) && elapsedMs > 0
    ? Math.min(PACE_MAX_MS, Math.max(PACE_MIN_MS, elapsedMs))
    : PACE_MAX_MS;
  if (wasCorrect) {
    const kind = question.type === "gap" ? "gap" : "binary";
    timing[kind] = [timing[kind][0] + ms, timing[kind][1] + 1];
  }
  const gain = Math.round(100 * answerPoints(question, wasCorrect, ms / 1000, c));
  return {
    ...state,
    points: Math.max(0, (state.points || 0) + gain),
    answered: state.answered + 1,
    correct: state.correct + (wasCorrect ? 1 : 0),
    timing,
    seen: {
      ...state.seen,
      [question.id]: wasCorrect ? [c + 1, w, 1] : [c, w + 1, 0],
    },
  };
}

/**
 * The raw numbers the rating is built from, in the shape rating.rate() and
 * the rating server both take.
 */
export function ratingInput(state) {
  const t = cleanTiming(state.timing);
  const avg = ([total, n]) => (n ? Math.round(total / n) : 0);
  return {
    streak: state.streak || 0,
    lastDay: dayIndex(state.lastDay),
    answered: state.answered || 0,
    points: state.points || 0,
    timing: {
      binaryMs: avg(t.binary), binaryN: t.binary[1],
      gapMs: avg(t.gap), gapN: t.gap[1],
    },
  };
}

export function reset() {
  try {
    localStorage.removeItem(scoped(KEY));
  } catch {
    /* ignore */
  }
  const empty = JSON.stringify(emptyState);
  cloudSetChunked(KEY, empty);
  // The pre-chunking key is blanked too, or loadRemote's most-progress-wins
  // comparison would find the old copy and resurrect what was just cleared.
  cloudSet(KEY, empty);
  return { ...emptyState };
}

/** Bookmark a question, or take the bookmark off. */
export function toggleSaved(state, id) {
  const saved = state.saved || [];
  return {
    ...state,
    saved: saved.includes(id) ? saved.filter((s) => s !== id) : [id, ...saved].slice(0, SAVED_MAX),
  };
}

/** Persist the user's preferred session length. */
export function setCount(state, count) {
  return { ...state, count: Math.min(100, Math.max(2, Math.round(count))) };
}

/**
 * Persist the chosen systems and subjects. Empty means every one of them.
 *
 * Only ids the taxonomy actually knows are kept. Before the bank was filed
 * by system and subject this list held category tags — "pharm", "cardio" —
 * and those are dropped on the way past rather than left to filter nothing.
 */
export function setSubjects(state, subjects) {
  return { ...state, subjects: keepKnown(subjects, SUBJECT_IDS) };
}

export function setSystems(state, systems) {
  return { ...state, systems: keepKnown(systems, SYSTEM_IDS) };
}

const keepKnown = (list, known) =>
  [...new Set(Array.isArray(list) ? list : [])].filter((id) => known.has(id)).slice(0, 30);

/** Persist which half of the app the user is in. */
export function setSection(state, section) {
  return { ...state, section: ["english", "quiz"].includes(section) ? section : null };
}

/** Persist the chosen language. */
export function setLanguage(state, lang) {
  return { ...state, lang: ["en", "uz"].includes(lang) ? lang : null };
}

/** Persist the chosen palette. */
export function setTheme(state, theme) {
  return { ...state, theme: ["auto", "light", "dark"].includes(theme) ? theme : "auto" };
}

/** Persist the user's preferred question format. */
export function setQType(state, qtype) {
  return { ...state, qtype: ["binary", "gap", "random"].includes(qtype) ? qtype : "random" };
}

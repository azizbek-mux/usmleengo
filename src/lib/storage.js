// Progress persistence.
//
// Telegram CloudStorage is the source of truth when available (it follows the
// user across devices and costs nothing). localStorage is both the offline
// fallback and a synchronous cache so the first paint never waits on a
// round-trip.

import { cloudAvailable, cloudGet, cloudGetChunked, cloudSet, cloudSetChunked } from "./telegram.js";

const KEY = "usmle_drops_v1";

export const emptyState = {
  // Which half of the app the user is in: "english" or "quiz". null means
  // they have not been asked yet — it triggers the first-run section picker.
  // Kept up to date as they move, so the app reopens where they left off.
  section: null,
  // Which question formats to serve: "binary", "gap" or "random".
  // null means the user has not been asked yet — it triggers first-run setup.
  qtype: null,
  // How many questions the user wants per session (2-100).
  count: 10,
  // Category tags the user has selected. Empty means the whole bank.
  subjects: [],
  xp: 0,
  streak: 0,
  best: 0,
  lastDay: null,
  answered: 0,
  correct: 0,
  // seen[id] = [timesCorrect, timesWrong] — drives the spaced-repetition weight
  seen: {},
};

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
    if (!["english", "quiz"].includes(merged.section)) merged.section = null;
    // Tags can disappear when the bank is re-authored, so anything unknown is
    // dropped on read rather than left to filter a round down to nothing.
    merged.subjects = Array.isArray(parsed.subjects)
      ? [...new Set(parsed.subjects.filter((t) => typeof t === "string" && t))].slice(0, 24)
      : [];
    return merged;
  } catch {
    return null;
  }
}

/** Synchronous read for first paint. */
export function loadLocal() {
  try {
    return merge(localStorage.getItem(KEY)) || { ...emptyState };
  } catch {
    return { ...emptyState };
  }
}

/**
 * Async read that prefers whichever copy has more XP. Cloud and local can
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

  const [legacy, chunked] = await Promise.all([
    cloudGet([KEY]).then((res) => res?.[KEY]),
    cloudGetChunked(KEY),
  ]);

  let best = localState;
  // Chunked is compared last so it wins a tie — it is the copy still being
  // written, and the legacy key stops being updated after this version.
  for (const raw of [legacy, chunked]) {
    const candidate = merge(raw);
    if (candidate && candidate.xp >= best.xp) best = candidate;
  }
  return best;
}

export function save(state) {
  const json = JSON.stringify(state);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* private mode / quota — cloud may still succeed */
  }
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

/** Record one answer. XP rewards correctness, not volume. */
export function record(state, question, wasCorrect) {
  const [c, w] = state.seen[question.id] || [0, 0];
  return {
    ...state,
    xp: state.xp + (wasCorrect ? 10 : 2),
    answered: state.answered + 1,
    correct: state.correct + (wasCorrect ? 1 : 0),
    seen: {
      ...state.seen,
      [question.id]: wasCorrect ? [c + 1, w] : [c, w + 1],
    },
  };
}

export function reset() {
  try {
    localStorage.removeItem(KEY);
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

/** Persist the user's preferred session length. */
export function setCount(state, count) {
  return { ...state, count: Math.min(100, Math.max(2, Math.round(count))) };
}

/** Persist the chosen category tags. Empty means every subject. */
export function setSubjects(state, subjects) {
  return { ...state, subjects: [...new Set(subjects)].slice(0, 24) };
}

/** Persist which half of the app the user is in. */
export function setSection(state, section) {
  return { ...state, section: ["english", "quiz"].includes(section) ? section : null };
}

/** Persist the user's preferred question format. */
export function setQType(state, qtype) {
  return { ...state, qtype: ["binary", "gap", "random"].includes(qtype) ? qtype : "random" };
}

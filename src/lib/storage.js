// Progress persistence.
//
// Telegram CloudStorage is the source of truth when available (it follows the
// user across devices and costs nothing). localStorage is both the offline
// fallback and a synchronous cache so the first paint never waits on a
// round-trip.

import { cloudAvailable, cloudGet, cloudSet } from "./telegram.js";

const KEY = "usmle_drops_v1";

export const emptyState = {
  // Which question formats to serve: "binary", "gap" or "random".
  // null means the user has not been asked yet — it triggers first-run setup.
  qtype: null,
  // How many questions the user wants per session (2-100).
  count: 10,
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
 */
export async function loadRemote(localState) {
  if (!cloudAvailable) return localState;
  const res = await cloudGet([KEY]);
  const remote = merge(res?.[KEY]);
  if (!remote) return localState;
  return remote.xp >= localState.xp ? remote : localState;
}

export function save(state) {
  const json = JSON.stringify(state);
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* private mode / quota — cloud may still succeed */
  }
  // Fire-and-forget: a failed cloud write must never block the UI.
  cloudSet(KEY, json);
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
  cloudSet(KEY, JSON.stringify(emptyState));
  return { ...emptyState };
}

/** Persist the user's preferred session length. */
export function setCount(state, count) {
  return { ...state, count: Math.min(100, Math.max(2, Math.round(count))) };
}

/** Persist the user's preferred question format. */
export function setQType(state, qtype) {
  return { ...state, qtype: ["binary", "gap", "random"].includes(qtype) ? qtype : "random" };
}

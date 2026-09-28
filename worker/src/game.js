// One live multiplayer game, as plain data.
//
// Everything a game does happens here: players joining and leaving, the
// host starting, answers coming in, and the clock moving it from question
// to answer to scoreboard. The room (room.js) only keeps this object,
// carries messages to and from the phones, and wakes itself when the clock
// says to. Keeping the rules out of the plumbing is what lets the tests
// play whole games in a few milliseconds.
//
// A game goes:
//
//   lobby → question → reveal → question → reveal … → final
//                                                        ↓ new round
//                                                      lobby
//
// and is closed once nobody has touched it for half an hour.

import { grade } from "../../src/lib/grade.js";
import {
  GAME_TYPES, MAX_PLAYERS, MIN_PLAYERS, QUESTION_COUNTS, SECONDS, gamePoints, placesOf,
} from "../../src/lib/game.js";

/**
 * "Get ready" before the first question only, so everyone starts together.
 * After that the scoreboard is the pause, and the next question opens as
 * soon as it ends.
 */
export const GET_READY_MS = 3000;
/** The right answer and the scoreboard, between questions. */
export const REVEAL_MS = 7000;
/** An answer sent in the last instant may arrive a little after the deadline. */
export const GRACE_MS = 1000;
/** A lobby or a finished game left alone this long is closed. */
export const IDLE_MS = 30 * 60 * 1000;
export const MAX_QUESTIONS = 30;

const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;
const IMG = /^[\w.-]{1,80}$/;
const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

/* ── what the creator sends ──────────────────────────────────────────── */

/** A question as the creator's app sent it, checked; or null. */
export function cleanQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const q = {
    id: text(raw.id, 80),
    type: raw.type,
    topic: text(raw.topic, 120),
    q: text(raw.q, 600),
    explain: text(raw.explain, 600),
  };
  if (raw.hideTopic === true) q.hideTopic = true;
  if (raw.img !== undefined) {
    if (typeof raw.img !== "string" || !IMG.test(raw.img)) return null;
    q.img = raw.img;
  }
  if (raw.type === "binary") {
    const ok = Array.isArray(raw.options) && raw.options.length === 2 &&
      raw.options.every((o) => typeof o === "string" && o && o.length <= 200);
    if (!ok || (raw.answer !== 0 && raw.answer !== 1) || (!q.q && !q.img)) return null;
    q.options = [...raw.options];
    q.answer = raw.answer;
  } else if (raw.type === "gap") {
    const ok = Array.isArray(raw.accept) && raw.accept.length > 0 && raw.accept.length <= 12 &&
      raw.accept.every((a) => typeof a === "string" && a && a.length <= 120);
    if (!ok || typeof raw.answer !== "string" || !raw.answer || raw.answer.length > 120 || !q.q) return null;
    q.accept = [...raw.accept];
    q.answer = raw.answer;
  } else {
    return null;
  }
  return q;
}

/** Every question valid, and between one and thirty of them; or null. */
export function cleanQuestions(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_QUESTIONS) return null;
  const out = list.map(cleanQuestion);
  return out.every(Boolean) ? out : null;
}

/**
 * The creator's choices. Kept with the game so a new round — which may be
 * started by someone else, if the creator has gone — picks its questions the
 * same way.
 */
export function cleanSettings(raw) {
  if (!SECONDS.includes(raw?.seconds) || !GAME_TYPES.some((t) => t.id === raw?.qtype)) return null;
  if (!QUESTION_COUNTS.includes(raw?.count)) return null;
  const tags = Array.isArray(raw.tags)
    ? [...new Set(raw.tags.filter((t) => typeof t === "string" && /^[\w-]{1,30}$/.test(t)))].slice(0, 30)
    : [];
  return { seconds: raw.seconds, qtype: raw.qtype, count: raw.count, tags };
}

/**
 * Two-option questions are written with the right answer first. The server
 * shuffles them, so the order on screen gives nothing away — the same rule
 * the app's own rounds follow.
 */
function present(q, random = Math.random) {
  if (q.type !== "binary" || random() < 0.5) return q;
  return { ...q, options: [q.options[1], q.options[0]], answer: 1 - q.answer };
}

/* ── the game ────────────────────────────────────────────────────────── */

export function newGame({ code, settings, questions, creatorToken, now, random = Math.random }) {
  return {
    code,
    settings,
    round: 1,
    questions: questions.map((q) => present(q, random)),
    creatorToken,
    creator: null,
    phase: "lobby",
    index: -1,
    opensAt: 0,
    endsAt: 0,
    revealEndsAt: 0,
    players: {}, // pid → player
    secrets: {}, // clientId → pid; lets a dropped phone back in as itself
    answers: {}, // pid → { given, correct, points }, for the current question
    seq: 0,
    touchedAt: now,
  };
}

const playersOf = (game) => Object.values(game.players);
const connected = (game) => playersOf(game).filter((p) => p.connected);

function removePlayer(game, pid) {
  delete game.players[pid];
  for (const [secret, id] of Object.entries(game.secrets)) if (id === pid) delete game.secrets[secret];
  if (game.creator === pid) game.creator = null;
}

/**
 * Who may start the game and begin a new round: whoever created it while
 * they are here, and otherwise whoever has been here longest — so a game
 * never waits on someone who closed the app.
 */
export function hostOf(game) {
  const creator = game.players[game.creator];
  if (creator?.connected) return creator.pid;
  const here = connected(game).sort((a, b) => a.seq - b.seq);
  return here[0]?.pid ?? creator?.pid ?? null;
}

/**
 * A phone joining, or coming back. Coming back works at any point, with
 * the same score; joining fresh only in the lobby.
 */
export function join(game, { clientId, name, username = null, creatorToken = null }, now) {
  if (typeof clientId !== "string" || !CLIENT_ID.test(clientId)) return { error: "bad-client" };
  if (game.phase === "closed") return { error: "missing" };

  const known = game.secrets[clientId];
  if (known && game.players[known]) {
    Object.assign(game.players[known], { connected: true, name, username });
    game.touchedAt = now;
    return { pid: known };
  }
  if (game.phase !== "lobby") return { error: "started" };
  if (playersOf(game).length >= MAX_PLAYERS) return { error: "full" };

  const pid = `p${++game.seq}`;
  game.players[pid] = { pid, seq: game.seq, name, username, score: 0, correct: 0, gained: 0, lastCorrect: null, connected: true };
  game.secrets[clientId] = pid;
  if (creatorToken && creatorToken === game.creatorToken && !game.creator) game.creator = pid;
  game.touchedAt = now;
  return { pid };
}

/** Leaving on purpose. In the lobby the seat is given up; mid-game the score stays on the board. */
export function leave(game, pid, now) {
  if (!game.players[pid]) return { error: "unknown" };
  if (game.phase === "lobby") removePlayer(game, pid);
  else game.players[pid].connected = false;
  game.touchedAt = now;
  afterDeparture(game, now);
  return { ok: true };
}

/** The connection dropped. They may be back in a moment, so they keep their seat. */
export function disconnect(game, pid, now) {
  if (!game.players[pid]) return { error: "unknown" };
  game.players[pid].connected = false;
  afterDeparture(game, now);
  return { ok: true };
}

/** The last person still thinking may just have left. */
function afterDeparture(game, now) {
  if (game.phase === "question" && everyoneAnswered(game)) reveal(game, now);
}

export function start(game, pid, now) {
  if (game.phase !== "lobby") return { error: "not-lobby" };
  if (hostOf(game) !== pid) return { error: "not-host" };
  if (connected(game).length < MIN_PLAYERS) return { error: "too-few" };
  // Anyone who left the lobby without coming back is not in this game.
  for (const p of playersOf(game)) if (!p.connected) removePlayer(game, p.pid);
  for (const p of playersOf(game)) Object.assign(p, { score: 0, correct: 0, gained: 0, lastCorrect: null });
  openQuestion(game, 0, now);
  return { ok: true };
}

function openQuestion(game, index, now) {
  game.phase = "question";
  game.index = index;
  game.opensAt = now + (index === 0 ? GET_READY_MS : 0);
  game.endsAt = game.opensAt + game.settings.seconds * 1000;
  game.answers = {};
  game.touchedAt = now;
}

function everyoneAnswered(game) {
  const here = connected(game);
  return here.length > 0 && here.every((p) => game.answers[p.pid]);
}

/**
 * One answer. Graded here, never on the phone, and paid by how much time was
 * left when it arrived. Only the first answer to each question counts.
 */
export function answer(game, pid, msg, now) {
  if (game.phase !== "question" || msg?.index !== game.index) return { error: "not-now" };
  if (!game.players[pid]) return { error: "unknown" };
  if (game.answers[pid]) return { error: "answered" };
  // The phone shows the question at opensAt by its own reckoning of the
  // server's clock, which can be a fraction of a second off.
  if (now < game.opensAt - 1000 || now > game.endsAt + GRACE_MS) return { error: "not-now" };

  const q = game.questions[game.index];
  let given;
  let correct;
  if (q.type === "binary") {
    if (msg.choice !== 0 && msg.choice !== 1) return { error: "bad-answer" };
    given = msg.choice;
    correct = given === q.answer;
  } else {
    given = text(msg.text, 120).trim();
    if (!given) return { error: "bad-answer" };
    correct = grade(q, given);
  }
  const limit = game.settings.seconds * 1000;
  const points = gamePoints(q.type, correct, game.endsAt - Math.max(now, game.opensAt), limit);
  game.answers[pid] = { given, correct, points };
  game.touchedAt = now;

  if (everyoneAnswered(game)) reveal(game, now);
  return { ok: true, correct, points };
}

function reveal(game, now) {
  for (const p of playersOf(game)) {
    const a = game.answers[p.pid];
    p.gained = a?.points || 0;
    p.score += p.gained;
    if (a?.correct) p.correct++;
    p.lastCorrect = a ? a.correct : null;
  }
  game.phase = "reveal";
  game.revealEndsAt = now + REVEAL_MS;
  game.touchedAt = now;
}

function finish(game, now) {
  game.phase = "final";
  game.touchedAt = now;
}

/**
 * The clock. Moves the game on if its time has come, and says whether it
 * did. Called when the room's alarm fires.
 */
export function tick(game, now) {
  let changed = false;
  for (let step = 0; step < 4; step++) {
    if (game.phase === "question" && now >= game.endsAt + GRACE_MS) {
      reveal(game, now);
    } else if (game.phase === "reveal" && now >= game.revealEndsAt) {
      const more = game.index + 1 < game.questions.length;
      // A game everyone has walked away from ends rather than play on to nobody.
      if (more && connected(game).length) openQuestion(game, game.index + 1, now);
      else finish(game, now);
    } else if ((game.phase === "lobby" || game.phase === "final") && now >= game.touchedAt + IDLE_MS) {
      game.phase = "closed";
    } else {
      break;
    }
    changed = true;
  }
  return changed;
}

/** When the clock next matters, or null for a closed game. */
export function nextWake(game) {
  if (game.phase === "question") return game.endsAt + GRACE_MS;
  if (game.phase === "reveal") return game.revealEndsAt;
  if (game.phase === "lobby" || game.phase === "final") return game.touchedAt + IDLE_MS;
  return null;
}

/** Back to the lobby with the same people and fresh questions. */
export function newRound(game, pid, questions, now, random = Math.random) {
  if (game.phase !== "final") return { error: "not-final" };
  if (hostOf(game) !== pid) return { error: "not-host" };
  const clean = cleanQuestions(questions);
  if (!clean) return { error: "bad-questions" };
  for (const p of playersOf(game)) if (!p.connected) removePlayer(game, p.pid);
  for (const p of playersOf(game)) Object.assign(p, { score: 0, correct: 0, gained: 0, lastCorrect: null });
  Object.assign(game, {
    questions: clean.map((q) => present(q, random)),
    round: game.round + 1,
    phase: "lobby",
    index: -1,
    answers: {},
    touchedAt: now,
  });
  return { ok: true };
}

/* ── what each phone is shown ────────────────────────────────────────── */

/**
 * How the room answered, shown with the right answer as Kahoot does: for a
 * two-option question, how many chose each option; for a typed one, how
 * many got it. Counts only — never who.
 */
function tallyOf(game, q) {
  const answers = Object.values(game.answers);
  if (q.type === "binary") {
    return { options: [0, 1].map((i) => answers.filter((a) => a.given === i).length), answered: answers.length };
  }
  return { right: answers.filter((a) => a.correct).length, answered: answers.length };
}

/**
 * The game as one player sees it. The right answer is only ever in here
 * once the question is over; until then a phone knows only what it chose.
 */
export function view(game, pid, now) {
  const host = hostOf(game);
  const inLobby = game.phase === "lobby";
  const list = playersOf(game).sort((a, b) =>
    inLobby ? a.seq - b.seq : b.score - a.score || a.seq - b.seq);
  const places = placesOf(list.map((p) => p.score));

  const out = {
    type: "state",
    now,
    code: game.code,
    round: game.round,
    phase: game.phase,
    you: pid,
    host,
    settings: game.settings,
    total: game.questions.length,
    index: game.index,
    players: list.map((p, i) => ({
      pid: p.pid,
      name: p.name,
      username: p.username,
      connected: p.connected,
      score: p.score,
      place: inLobby ? null : places[i],
      gained: p.gained,
      correct: p.correct,
      lastCorrect: p.lastCorrect,
      answered: game.phase === "question" ? Boolean(game.answers[p.pid]) : undefined,
    })),
  };

  if (game.phase === "question" || game.phase === "reveal") {
    const q = game.questions[game.index];
    out.question = {
      type: q.type,
      topic: q.hideTopic ? null : q.topic,
      q: q.q,
      img: q.img || null,
      options: q.type === "binary" ? q.options : null,
    };
    out.opensAt = game.opensAt;
    out.endsAt = game.endsAt;
    const mine = game.answers[pid];
    if (game.phase === "question") {
      out.mine = mine ? { given: mine.given } : null;
    } else {
      out.mine = mine ? { given: mine.given, correct: mine.correct, points: mine.points } : null;
      out.solution = { answer: q.answer, explain: q.explain, tally: tallyOf(game, q) };
      out.revealEndsAt = game.revealEndsAt;
    }
  }
  return out;
}

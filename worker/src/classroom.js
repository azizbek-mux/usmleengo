// Classrooms: a teacher, their students, and what each side can see.
//
// A teacher creates a class and shares its six-digit code or invite link.
// Students ask to join; the teacher approves or declines each one. Up to a
// hundred students a class.
//
// The teacher sees every student's numbers — points and global rank, day
// streak, XP, accuracy, weak topics, average time — both all-time and since
// the student joined. "Since joining" is measured against a snapshot of the
// student's numbers taken the moment the teacher approved them (members.base).
// Students see the class ranking: the top ten by points and their own place.
// Bookmarked questions never leave the student's phone.
//
// Accuracy and weak topics are not part of the rating, so a student's app
// sends them (players.correct and players.topics, see checkDetail) only once
// it has asked to join a class.

import { points, rate, standings } from "../../src/lib/rating.js";
import { NAME_MAX, clean } from "../../src/lib/scorecard.js";
import { fromRow, serverToday } from "./board.js";

export const CLASS_SCHEMA = `
CREATE TABLE IF NOT EXISTS classes (
  id               TEXT PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  teacher          TEXT NOT NULL,
  teacher_name     TEXT NOT NULL,
  teacher_username TEXT,
  created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS classes_teacher ON classes (teacher);
CREATE TABLE IF NOT EXISTS members (
  class_id     TEXT NOT NULL,
  player       TEXT NOT NULL,
  status       TEXT NOT NULL,
  name         TEXT NOT NULL,
  username     TEXT,
  requested_at INTEGER NOT NULL,
  joined_at    INTEGER,
  base         TEXT,
  PRIMARY KEY (class_id, player)
);
CREATE INDEX IF NOT EXISTS members_player ON members (player)`;

export const LIMITS = {
  students: 100, // active in one class
  waiting: 50, // join requests waiting in one class
  teaching: 10, // classes one teacher runs
  learning: 10, // classes one student belongs to
};
/** Below this many answers a category's accuracy says more about luck than the student. */
export const MIN_TOPIC_ANSWERS = 5;

const hex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const newCode = () => String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
const ok = (body) => ({ status: 200, body });
const fail = (status, error) => ({ status, body: { error } });

function className(raw) {
  const name = [...clean(raw)].slice(0, NAME_MAX).join("");
  return name || null;
}

function topicsOf(text) {
  try {
    const t = JSON.parse(text || "{}");
    return t && typeof t === "object" ? t : {};
  } catch {
    return {};
  }
}

/** The weakest categories with enough answers to judge: [{ tag, pct, answered }]. */
export function weakest(topics, n = 3) {
  return Object.entries(topics)
    .map(([tag, [right, wrong]]) => ({ tag, answered: right + wrong, pct: right + wrong ? Math.round((right / (right + wrong)) * 100) : 0 }))
    .filter((t) => t.answered >= MIN_TOPIC_ANSWERS)
    .sort((a, b) => a.pct - b.pct || b.answered - a.answered)
    .slice(0, n);
}

/** Totals behind a player row: what "since joining" subtracts from. */
function totalsOf(p, today) {
  const s = p.score;
  return {
    points: points(rate(s, today).overall),
    xp: s.xp,
    answered: s.answered,
    correct: p.correct,
    bms: s.timing.binaryMs * s.timing.binaryN,
    bn: s.timing.binaryN,
    gms: s.timing.gapMs * s.timing.gapN,
    gn: s.timing.gapN,
    topics: topicsOf(p.topics),
  };
}

const accuracy = (correct, answered) => (answered > 0 ? Math.round((correct / answered) * 100) : null);

/** A player row as fromRow would read it, from a members ⋈ players join. */
function playerOf(r) {
  return fromRow({
    key: r.player,
    name: r.p_name || r.m_name,
    username: r.p_name ? r.p_username : r.m_username,
    streak: r.streak ?? 0, last_day: r.last_day ?? 0, xp: r.xp ?? 0, answered: r.answered ?? 0,
    binary_ms: r.binary_ms ?? 0, binary_n: r.binary_n ?? 0, gap_ms: r.gap_ms ?? 0, gap_n: r.gap_n ?? 0,
    correct: r.correct ?? 0, topics: r.topics ?? "",
  });
}

/**
 * One student's numbers as their teacher sees them.
 *   all   — everything they have done in usmleengo
 *   since — only what they have done since joining this class
 */
export function studentStats(p, base, today, rankOf) {
  const rating = rate(p.score, today);
  const now = totalsOf(p, today);
  const all = {
    points: now.points,
    rank: rankOf(now.points),
    streak: rating.raw.streak,
    xp: now.xp,
    answered: now.answered,
    accuracy: accuracy(now.correct, now.answered),
    pace: rating.raw.pace,
    weak: weakest(now.topics),
  };
  let since = null;
  if (base) {
    const answered = Math.max(0, now.answered - base.answered);
    const correct = Math.max(0, now.correct - base.correct);
    const bn = Math.max(0, now.bn - base.bn);
    const gn = Math.max(0, now.gn - base.gn);
    const ms = Math.max(0, now.bms - base.bms) + Math.max(0, now.gms - base.gms);
    const topics = {};
    for (const [tag, [r, w]] of Object.entries(now.topics)) {
      const [br, bw] = base.topics?.[tag] || [0, 0];
      topics[tag] = [Math.max(0, r - br), Math.max(0, w - bw)];
    }
    since = {
      points: now.points - base.points,
      streak: rating.raw.streak,
      xp: Math.max(0, now.xp - base.xp),
      answered,
      accuracy: accuracy(correct, answered),
      pace: bn + gn ? Math.round(ms / (bn + gn)) : null,
      weak: weakest(topics),
    };
  }
  return { all, since };
}

/** Everyone's points, sorted, for a player's place on the whole rating. */
export function globalRanks(players, today) {
  const all = [...players.values()].map((p) => points(rate(p.score, today).overall)).sort((a, b) => b - a);
  const rankOf = (pts) => {
    let lo = 0;
    let hi = all.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (all[mid] > pts) lo = mid + 1; else hi = mid; }
    return lo + 1;
  };
  return { rankOf, total: all.length };
}

async function classOf(db, id) {
  const { results } = await db.prepare(`SELECT * FROM classes WHERE id = ?1`).bind(String(id || "")).all();
  return results[0] || null;
}

async function memberOf(db, classId, player) {
  const { results } = await db.prepare(`SELECT * FROM members WHERE class_id = ?1 AND player = ?2`).bind(classId, player).all();
  return results[0] || null;
}

async function counts(db, classId) {
  const { results } = await db.prepare(`
    SELECT SUM(status = 'active') AS students, SUM(status = 'pending') AS waiting
    FROM members WHERE class_id = ?1`).bind(classId).all();
  return { students: results[0]?.students || 0, waiting: results[0]?.waiting || 0 };
}

/* ── the actions ─────────────────────────────────────────────────────── */

/** The classes someone teaches and the ones they belong to. */
async function mine(db, me) {
  const teaching = await db.prepare(`
    SELECT c.id, c.name, c.code,
      (SELECT COUNT(*) FROM members m WHERE m.class_id = c.id AND m.status = 'active') AS students,
      (SELECT COUNT(*) FROM members m WHERE m.class_id = c.id AND m.status = 'pending') AS waiting
    FROM classes c WHERE c.teacher = ?1 ORDER BY c.created_at`).bind(me.key).all();
  const learning = await db.prepare(`
    SELECT c.id, c.name, c.teacher_name, m.status
    FROM members m JOIN classes c ON c.id = m.class_id
    WHERE m.player = ?1 ORDER BY m.requested_at`).bind(me.key).all();
  return ok({ teaching: teaching.results, learning: learning.results });
}

async function create(db, me, body, now) {
  const name = className(body.name);
  if (!name) return fail(400, "name");
  const { results } = await db.prepare(`SELECT COUNT(*) AS n FROM classes WHERE teacher = ?1`).bind(me.key).all();
  if (results[0].n >= LIMITS.teaching) return fail(409, "too-many-classes");
  const id = hex(8);
  // Codes are unique; a clash just means trying another.
  for (let i = 0; i < 6; i++) {
    const code = newCode();
    try {
      await db.prepare(`
        INSERT INTO classes (id, code, name, teacher, teacher_name, teacher_username, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`).bind(id, code, name, me.key, me.name, me.username, Math.floor(now / 1000)).run();
      return ok({ class: { id, code, name } });
    } catch (err) {
      if (!/UNIQUE/i.test(String(err?.message))) throw err;
    }
  }
  return fail(503, "no-free-code");
}

/** Ask to join by code. The teacher still has to approve. */
async function join(db, me, body, now) {
  const code = String(body.code || "");
  if (!/^\d{6}$/.test(code)) return fail(400, "code");
  const { results } = await db.prepare(`SELECT * FROM classes WHERE code = ?1`).bind(code).all();
  const cls = results[0];
  if (!cls) return fail(404, "no-class");
  if (cls.teacher === me.key) return fail(409, "own-class");
  const summary = { id: cls.id, name: cls.name, teacher_name: cls.teacher_name };
  const existing = await memberOf(db, cls.id, me.key);
  if (existing) return ok({ status: existing.status, class: summary });

  const mineCount = await db.prepare(`SELECT COUNT(*) AS n FROM members WHERE player = ?1`).bind(me.key).all();
  if (mineCount.results[0].n >= LIMITS.learning) return fail(409, "too-many-classes");
  const c = await counts(db, cls.id);
  if (c.students >= LIMITS.students || c.waiting >= LIMITS.waiting) return fail(409, "full");

  await db.prepare(`
    INSERT INTO members (class_id, player, status, name, username, requested_at)
    VALUES (?1, ?2, 'pending', ?3, ?4, ?5)`).bind(cls.id, me.key, me.name, me.username, Math.floor(now / 1000)).run();
  return ok({ status: "pending", class: summary });
}

/** The teacher lets a student in, snapshotting their numbers for "since joining"; or turns them away. */
async function approve(db, me, body, now) {
  const cls = await classOf(db, body.classId);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  const m = await memberOf(db, cls.id, String(body.player || ""));
  if (!m || m.status !== "pending") return fail(404, "no-request");
  if (!body.accept) {
    await db.prepare(`DELETE FROM members WHERE class_id = ?1 AND player = ?2`).bind(cls.id, m.player).run();
    return ok({ ok: true });
  }
  if ((await counts(db, cls.id)).students >= LIMITS.students) return fail(409, "full");
  const { results } = await db.prepare(`SELECT * FROM players WHERE key = ?1`).bind(m.player).all();
  const today = serverToday(now);
  const base = results[0]
    ? totalsOf(fromRow(results[0]), today)
    : { points: 0, xp: 0, answered: 0, correct: 0, bms: 0, bn: 0, gms: 0, gn: 0, topics: {} };
  await db.prepare(`
    UPDATE members SET status = 'active', joined_at = ?3, base = ?4
    WHERE class_id = ?1 AND player = ?2`).bind(cls.id, m.player, Math.floor(now / 1000), JSON.stringify(base)).run();
  return ok({ ok: true });
}

/** A teacher removes a student; a student leaves. */
async function remove(db, me, body) {
  const cls = await classOf(db, body.classId);
  if (!cls) return fail(404, "no-class");
  const player = String(body.player || me.key);
  if (player !== me.key && cls.teacher !== me.key) return fail(403, "not-teacher");
  await db.prepare(`DELETE FROM members WHERE class_id = ?1 AND player = ?2`).bind(cls.id, player).run();
  return ok({ ok: true });
}

async function rename(db, me, body) {
  const cls = await classOf(db, body.classId);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  const name = className(body.name);
  if (!name) return fail(400, "name");
  await db.prepare(`UPDATE classes SET name = ?2 WHERE id = ?1`).bind(cls.id, name).run();
  return ok({ ok: true });
}

/** Close a class for good: the class, its members, everything in it. */
async function close(db, me, body) {
  const cls = await classOf(db, body.classId);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  for (const sql of [
    `DELETE FROM members WHERE class_id = ?1`,
    `DELETE FROM classes WHERE id = ?1`,
  ]) await db.prepare(sql).bind(cls.id).run();
  return ok({ ok: true });
}

/** A class as the person asking sees it: the teacher's dashboard, or a student's view. */
async function view(db, me, body, now, players) {
  const cls = await classOf(db, body.classId);
  if (!cls) return fail(404, "no-class");
  const today = serverToday(now);
  const info = { id: cls.id, name: cls.name, code: cls.code, teacherName: cls.teacher_name, teacherUsername: cls.teacher_username };

  const rows = (await db.prepare(`
    SELECT m.player, m.status, m.name AS m_name, m.username AS m_username, m.requested_at, m.joined_at, m.base,
           p.name AS p_name, p.username AS p_username, p.streak, p.last_day, p.xp, p.answered,
           p.binary_ms, p.binary_n, p.gap_ms, p.gap_n, p.correct, p.topics
    FROM members m LEFT JOIN players p ON p.key = m.player
    WHERE m.class_id = ?1`).bind(cls.id).all()).results;
  const active = rows.filter((r) => r.status === "active");

  if (cls.teacher === me.key) {
    const { rankOf, total } = globalRanks(players, today);
    const students = active.map((r) => {
      const p = playerOf(r);
      let base = null;
      try { base = r.base ? JSON.parse(r.base) : null; } catch { base = null; }
      return {
        player: r.player,
        name: p.name,
        username: p.username,
        joinedAt: r.joined_at,
        ...studentStats(p, base, today, rankOf),
      };
    }).sort((a, b) => b.all.points - a.all.points);
    const requests = rows.filter((r) => r.status === "pending")
      .map((r) => ({ player: r.player, name: r.m_name, username: r.m_username, requestedAt: r.requested_at }));
    return ok({ role: "teacher", class: info, students, requests, rankedOf: total, limits: LIMITS });
  }

  const mine = rows.find((r) => r.player === me.key);
  if (!mine) return fail(403, "not-member");
  const studentInfo = { id: info.id, name: info.name, teacherName: info.teacherName, teacherUsername: info.teacherUsername };
  if (mine.status !== "active") return ok({ role: "student", status: "pending", class: studentInfo });

  // The class ranking: the same points as the rating, among classmates.
  const field = active.filter((r) => r.player !== me.key).map((r) => {
    const p = playerOf(r);
    return { key: r.player, name: p.name, username: p.username, rating: rate(p.score, today) };
  });
  const self = playerOf(mine);
  const s = standings("overall", field, { key: me.key, name: null, rating: rate(self.score, today) });
  const row = (x) => ({
    place: x.place, name: x.isMe ? null : x.name, username: x.isMe ? null : x.username,
    isMe: Boolean(x.isMe), points: points(x.rating.overall),
  });
  return ok({
    role: "student",
    status: "active",
    class: studentInfo,
    ranking: {
      top: s.rows.slice(0, 10).map(row),
      me: s.me ? { place: s.me.place, total: s.total, points: points(s.me.rating.overall) } : null,
    },
    students: active.length,
  });
}

const ACTIONS = { mine, create, join, approve, remove, rename, close, view };

/** Run one classroom action for a verified player. */
export async function classAction(action, { db, me, body, now = Date.now(), players = new Map() }) {
  const run = ACTIONS[action];
  if (!run) return fail(404, "no-action");
  return run(db, me, body || {}, now, players);
}

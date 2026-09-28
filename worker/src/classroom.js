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

import { grade } from "../../src/lib/grade.js";
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
CREATE INDEX IF NOT EXISTS members_player ON members (player);
CREATE TABLE IF NOT EXISTS packages (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  questions  TEXT NOT NULL,
  count      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS packages_class ON packages (class_id);
CREATE TABLE IF NOT EXISTS assignments (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL,
  package_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  due_at     INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS assignments_class ON assignments (class_id);
CREATE TABLE IF NOT EXISTS attempts (
  assignment_id TEXT NOT NULL,
  player        TEXT NOT NULL,
  score         INTEGER NOT NULL,
  total         INTEGER NOT NULL,
  answers       TEXT NOT NULL,
  finished_at   INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, player)
);
CREATE TABLE IF NOT EXISTS images (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS images_class ON images (class_id);
CREATE TABLE IF NOT EXISTS uploads (
  token      TEXT PRIMARY KEY,
  owner      TEXT NOT NULL,
  file_id    TEXT NOT NULL,
  file_name  TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  text       TEXT,
  opened     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS uploads_owner ON uploads (owner)`;

export const LIMITS = {
  students: 100, // active in one class
  waiting: 50, // join requests waiting in one class
  teaching: 10, // classes one teacher runs
  learning: 10, // classes one student belongs to
  packages: 50, // question packages in one class
  questions: 300, // questions in one package
  assignments: 100, // assignments in one class
  images: 600, // pictures in one class
  imageBytes: 350 * 1024, // one picture, after the phone has compressed it
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
    `DELETE FROM attempts WHERE assignment_id IN (SELECT id FROM assignments WHERE class_id = ?1)`,
    `DELETE FROM assignments WHERE class_id = ?1`,
    `DELETE FROM packages WHERE class_id = ?1`,
    `DELETE FROM images WHERE class_id = ?1`,
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
  const packages = (await db.prepare(`
    SELECT id, name, count, updated_at FROM packages WHERE class_id = ?1 ORDER BY created_at`).bind(cls.id).all()).results
    .map((p) => ({ id: p.id, name: p.name, count: p.count }));
  const homework = (await db.prepare(`
    SELECT a.id, a.title, a.package_id, a.due_at,
      (SELECT COUNT(*) FROM attempts t WHERE t.assignment_id = a.id) AS done,
      (SELECT score FROM attempts t WHERE t.assignment_id = a.id AND t.player = ?2) AS my_score,
      (SELECT total FROM attempts t WHERE t.assignment_id = a.id AND t.player = ?2) AS my_total,
      (SELECT finished_at FROM attempts t WHERE t.assignment_id = a.id AND t.player = ?2) AS my_at
    FROM assignments a WHERE a.class_id = ?1 ORDER BY a.due_at`).bind(cls.id, me.key).all()).results;

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
    const assignments = homework.map((a) => ({
      id: a.id, title: a.title, packageId: a.package_id, dueAt: a.due_at * 1000, done: a.done,
    }));
    return ok({ role: "teacher", class: info, students, requests, rankedOf: total, limits: LIMITS, packages, assignments });
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
    packages,
    assignments: homework.map((a) => ({
      id: a.id,
      title: a.title,
      packageId: a.package_id,
      dueAt: a.due_at * 1000,
      mine: a.my_at ? { score: a.my_score, total: a.my_total, late: a.my_at > a.due_at } : null,
    })),
  });
}

/* ── question packages ───────────────────────────────────────────────────
   A teacher's own questions, in named packages. A question is either
   "choice" (2 to 10 options, one right) or "typed" (an answer, plus other
   spellings to accept). Questions picked from the usmleengo bank are copied
   in the same shape. Pictures are either the bank's own ("p01-a.webp") or
   the class's ("c:<id>", see images below). */

const QID = /^[A-Za-z0-9_-]{1,40}$/;
const IMG = /^(c:[0-9a-f]{16,40}|[\w.-]{1,80})$/;

/** Text a teacher wrote: line breaks kept, control characters dropped. */
function qtext(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0009\u000b-\u001f\u007f‪-‮⁦-⁩]/g, "").trim().slice(0, max);
}

/** One question as the teacher's app sent it, checked; or null. */
export function cleanClassQuestion(raw) {
  if (!raw || typeof raw !== "object") return null;
  const q = {
    id: QID.test(raw.id) ? raw.id : `q${hex(6)}`,
    type: raw.type,
    q: qtext(raw.q, 2000),
    explain: qtext(raw.explain, 2000),
  };
  const topic = qtext(raw.topic, 120);
  if (topic) q.topic = topic;
  if (raw.img) {
    if (typeof raw.img !== "string" || !IMG.test(raw.img)) return null;
    q.img = raw.img;
  }
  if (!q.q && !q.img) return null;
  if (raw.type === "choice") {
    const options = Array.isArray(raw.options) ? raw.options.map((o) => qtext(o, 400)) : [];
    if (options.length < 2 || options.length > 10 || options.some((o) => !o)) return null;
    if (!Number.isInteger(raw.answer) || raw.answer < 0 || raw.answer >= options.length) return null;
    q.options = options;
    q.answer = raw.answer;
  } else if (raw.type === "typed") {
    const answer = qtext(raw.answer, 200);
    if (!answer) return null;
    const accept = [answer, ...(Array.isArray(raw.accept) ? raw.accept : [])]
      .map((a) => qtext(a, 200)).filter(Boolean);
    q.answer = answer;
    q.accept = [...new Set(accept.map((a) => a.toLowerCase()))].slice(0, 12);
  } else {
    return null;
  }
  return q;
}

/** Is this person the class's teacher, or one of its let-in students? */
async function roleIn(db, cls, me) {
  if (cls.teacher === me.key) return "teacher";
  const m = await memberOf(db, cls.id, me.key);
  return m?.status === "active" ? "student" : null;
}

async function packageOf(db, id) {
  const { results } = await db.prepare(`SELECT * FROM packages WHERE id = ?1`).bind(String(id || "")).all();
  return results[0] || null;
}

async function assignmentOf(db, id) {
  const { results } = await db.prepare(`SELECT * FROM assignments WHERE id = ?1`).bind(String(id || "")).all();
  return results[0] || null;
}

/** Create or replace a package — its whole list of questions at once. */
async function savepackage(db, me, body, now) {
  const cls = await classOf(db, body.classId);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  const p = body.package || {};
  const name = [...clean(p.name)].slice(0, 60).join("");
  if (!name) return fail(400, "name");
  const list = Array.isArray(p.questions) ? p.questions : [];
  if (!list.length || list.length > LIMITS.questions) return fail(400, "questions");
  const questions = list.map(cleanClassQuestion);
  const bad = questions.findIndex((q) => !q);
  if (bad >= 0) return { status: 400, body: { error: "question", index: bad } };
  // Ids must stay unique within the package: results are kept per question.
  const seen = new Set();
  for (const q of questions) {
    while (seen.has(q.id)) q.id = `q${hex(6)}`;
    seen.add(q.id);
  }
  const at = Math.floor(now / 1000);
  const existing = p.id ? await packageOf(db, p.id) : null;
  if (existing && existing.class_id !== cls.id) return fail(403, "not-teacher");
  if (existing) {
    await db.prepare(`UPDATE packages SET name = ?2, questions = ?3, count = ?4, updated_at = ?5 WHERE id = ?1`)
      .bind(existing.id, name, JSON.stringify(questions), questions.length, at).run();
    return ok({ package: { id: existing.id, name, count: questions.length } });
  }
  const { results } = await db.prepare(`SELECT COUNT(*) AS n FROM packages WHERE class_id = ?1`).bind(cls.id).all();
  if (results[0].n >= LIMITS.packages) return fail(409, "too-many-packages");
  const id = hex(8);
  await db.prepare(`
    INSERT INTO packages (id, class_id, name, questions, count, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`).bind(id, cls.id, name, JSON.stringify(questions), questions.length, at).run();
  return ok({ package: { id, name, count: questions.length } });
}

/** A package's questions, for its teacher or a student of its class. */
async function getpackage(db, me, body) {
  const pkg = await packageOf(db, body.packageId);
  if (!pkg) return fail(404, "no-package");
  const cls = await classOf(db, pkg.class_id);
  if (!cls || !(await roleIn(db, cls, me))) return fail(403, "not-member");
  return ok({ package: { id: pkg.id, name: pkg.name, questions: JSON.parse(pkg.questions) } });
}

/** A package goes, and with it every assignment of it and every result. */
async function deletepackage(db, me, body) {
  const pkg = await packageOf(db, body.packageId);
  if (!pkg) return fail(404, "no-package");
  const cls = await classOf(db, pkg.class_id);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  await db.prepare(`DELETE FROM attempts WHERE assignment_id IN (SELECT id FROM assignments WHERE package_id = ?1)`).bind(pkg.id).run();
  await db.prepare(`DELETE FROM assignments WHERE package_id = ?1`).bind(pkg.id).run();
  await db.prepare(`DELETE FROM packages WHERE id = ?1`).bind(pkg.id).run();
  return ok({ ok: true });
}

/** Set a package as homework, due by a date. */
async function assign(db, me, body, now) {
  const pkg = await packageOf(db, body.packageId);
  if (!pkg) return fail(404, "no-package");
  const cls = await classOf(db, pkg.class_id);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  const due = Math.floor(Number(body.dueAt) / 1000);
  const at = Math.floor(now / 1000);
  if (!Number.isFinite(due) || due <= at || due > at + 366 * 86400) return fail(400, "due");
  const title = [...clean(body.title || pkg.name)].slice(0, 60).join("") || pkg.name;
  const { results } = await db.prepare(`SELECT COUNT(*) AS n FROM assignments WHERE class_id = ?1`).bind(cls.id).all();
  if (results[0].n >= LIMITS.assignments) return fail(409, "too-many-assignments");
  const id = hex(8);
  await db.prepare(`
    INSERT INTO assignments (id, class_id, package_id, title, due_at, created_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(id, cls.id, pkg.id, title, due, at).run();
  return ok({ assignment: { id, title, packageId: pkg.id, dueAt: due * 1000 } });
}

async function unassign(db, me, body) {
  const a = await assignmentOf(db, body.assignmentId);
  if (!a) return fail(404, "no-assignment");
  const cls = await classOf(db, a.class_id);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  await db.prepare(`DELETE FROM attempts WHERE assignment_id = ?1`).bind(a.id).run();
  await db.prepare(`DELETE FROM assignments WHERE id = ?1`).bind(a.id).run();
  return ok({ ok: true });
}

/** Is a given answer right? Choice by the option's index; typed as the app grades it. */
function isRight(q, given) {
  if (q.type === "choice") return Number.isInteger(given) && given === q.answer;
  return typeof given === "string" && grade({ accept: q.accept }, given);
}

/**
 * A student hands in an assignment. The server grades it against the
 * package, so a score cannot be claimed; only the first attempt counts, and
 * one handed in after the due date is marked late.
 */
async function attempt(db, me, body, now) {
  const a = await assignmentOf(db, body.assignmentId);
  if (!a) return fail(404, "no-assignment");
  const cls = await classOf(db, a.class_id);
  if (!cls || (await roleIn(db, cls, me)) !== "student") return fail(403, "not-member");
  const pkg = await packageOf(db, a.package_id);
  if (!pkg) return fail(404, "no-package");
  const questions = JSON.parse(pkg.questions);
  const given = body.answers && typeof body.answers === "object" ? body.answers : {};
  const marks = {};
  for (const q of questions) if (q.id in given) marks[q.id] = isRight(q, given[q.id]) ? 1 : 0;
  const score = Object.values(marks).reduce((s, m) => s + m, 0);
  const at = Math.floor(now / 1000);
  const r = await db.prepare(`
    INSERT OR IGNORE INTO attempts (assignment_id, player, score, total, answers, finished_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)`).bind(a.id, me.key, score, questions.length, JSON.stringify(marks), at).run();
  const first = (r?.meta?.changes ?? 0) > 0;
  const kept = first ? { score, total: questions.length, finished_at: at }
    : (await db.prepare(`SELECT * FROM attempts WHERE assignment_id = ?1 AND player = ?2`).bind(a.id, me.key).all()).results[0];
  return ok({ first, score: kept.score, total: kept.total, late: kept.finished_at > a.due_at, marks: first ? marks : undefined });
}

/** How an assignment went: every student's score, and how the class did on each question. */
async function results(db, me, body) {
  const a = await assignmentOf(db, body.assignmentId);
  if (!a) return fail(404, "no-assignment");
  const cls = await classOf(db, a.class_id);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  const pkg = await packageOf(db, a.package_id);
  const questions = pkg ? JSON.parse(pkg.questions) : [];
  const rows = (await db.prepare(`
    SELECT m.player, m.name AS m_name, m.username AS m_username, p.name AS p_name, p.username AS p_username,
           t.score, t.total, t.answers, t.finished_at
    FROM members m
    LEFT JOIN players p ON p.key = m.player
    LEFT JOIN attempts t ON t.assignment_id = ?2 AND t.player = m.player
    WHERE m.class_id = ?1 AND m.status = 'active'`).bind(cls.id, a.id).all()).results;
  const tally = new Map(questions.map((q) => [q.id, { right: 0, answered: 0 }]));
  const students = rows.map((r) => {
    if (r.answers) {
      for (const [qid, mark] of Object.entries(JSON.parse(r.answers))) {
        const t = tally.get(qid);
        if (t) { t.answered++; t.right += mark; }
      }
    }
    return {
      player: r.player,
      name: r.p_name || r.m_name,
      username: r.p_name ? r.p_username : r.m_username,
      done: r.score !== null && r.score !== undefined,
      score: r.score ?? null,
      total: r.total ?? questions.length,
      finishedAt: r.finished_at ? r.finished_at * 1000 : null,
      late: r.finished_at ? r.finished_at > a.due_at : false,
    };
  }).sort((x, y) => (y.done - x.done) || ((y.score ?? 0) - (x.score ?? 0)));
  return ok({
    assignment: { id: a.id, title: a.title, dueAt: a.due_at * 1000, packageName: pkg?.name || "" },
    students,
    questions: questions.map((q, i) => {
      const t = tally.get(q.id);
      return {
        n: i + 1,
        id: q.id,
        text: q.q ? q.q.slice(0, 140) : "(picture)",
        answered: t.answered,
        pct: t.answered ? Math.round((t.right / t.answered) * 100) : null,
      };
    }),
  });
}

/* ── pictures ─────────────────────────────────────────────────────────── */

const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"];

/** A picture for a question, already shrunk by the phone. Returns its reference, "c:<id>". */
async function image(db, me, body, now) {
  const cls = await classOf(db, body.classId);
  if (!cls || cls.teacher !== me.key) return fail(403, "not-teacher");
  if (!IMAGE_TYPES.includes(body.mime)) return fail(400, "image-type");
  const data = typeof body.data === "string" ? body.data : "";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return fail(400, "image");
  if (data.length * 0.75 > LIMITS.imageBytes) return fail(413, "image-too-large");
  const { results } = await db.prepare(`SELECT COUNT(*) AS n FROM images WHERE class_id = ?1`).bind(cls.id).all();
  if (results[0].n >= LIMITS.images) return fail(409, "too-many-images");
  const id = hex(12);
  await db.prepare(`INSERT INTO images (id, class_id, mime, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(id, cls.id, body.mime, data, Math.floor(now / 1000)).run();
  return ok({ img: `c:${id}` });
}

/** A class picture, by id. Anyone with the link may see it, as with any picture sent in a chat. */
export async function servedImage(db, id) {
  if (!/^[0-9a-f]{16,40}$/.test(id)) return null;
  const { results } = await db.prepare(`SELECT mime, data FROM images WHERE id = ?1`).bind(id).all();
  if (!results[0]) return null;
  const bin = atob(results[0].data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: results[0].mime, bytes };
}

const ACTIONS = {
  mine, create, join, approve, remove, rename, close, view,
  savepackage, package: getpackage, deletepackage, assign, unassign, attempt, results, image,
};

/** Run one classroom action for a verified player. */
export async function classAction(action, { db, me, body, now = Date.now(), players = new Map() }) {
  const run = ACTIONS[action];
  if (!run) return fail(404, "no-action");
  return run(db, me, body || {}, now, players);
}

import React, { useCallback, useEffect, useState } from "react";
import { classCall, classInviteParam } from "../lib/classApi.js";
import { AssignScreen, AssignmentResults, PackageEditor, dayText } from "./ClassPackages.jsx";
import { formatPace } from "../lib/rating.js";
import { setClassSharing } from "../lib/ratingApi.js";
import { classInviteMessage } from "../lib/shareText.js";
import { tagLabel } from "../lib/tags.js";
import { APP_LINK, haptic, initData, share } from "../lib/telegram.js";
import { BackBar, ScreenHead } from "./Chrome.jsx";
import { PlaceMark } from "./Rating.jsx";

// The Class tab. Teachers create classrooms and see every student's numbers;
// students join with a code or an invite link, once the teacher lets them in,
// and see the class ranking. See worker/src/classroom.js for the rules.

const REASONS = {
  telegram: "Classes work inside Telegram. Open usmleengo from @usmleengo_bot.",
  offline: "Couldn’t reach the server. Check your internet and try again.",
  "no-class": "No class with that code. Check it with your teacher.",
  "own-class": "That’s a class you teach.",
  full: "That class is full.",
  "too-many-classes": "That’s the most classes one person can have.",
  name: "Give the class a name.",
  "not-member": "You’re not in this class any more.",
  "not-teacher": "Only the teacher can do that.",
};
const reasonOf = (err) => REASONS[err?.code] || "Something went wrong. Try again.";

const pct = (n) => (n === null || n === undefined ? "—" : `${n}%`);
const signed = (n) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

/** Load something from the server, again whenever the app comes back to the front. */
function useServer(load, deps) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const run = useCallback(() => {
    load().then((d) => { setData(d); setError(null); }).catch((e) => setError(e));
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    run();
    const onVisible = () => { if (!document.hidden) run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [run]);
  return { data, error, reload: run };
}

/** A button that needs a second tap within four seconds. */
function TwoTap({ label, confirm, onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`btn ${armed ? "btn-danger" : "btn-ghost"} class-two-tap`}
      onClick={() => {
        haptic(armed ? "warning" : "light");
        if (armed) { setArmed(false); onConfirm(); } else setArmed(true);
      }}
    >
      {armed ? confirm : label}
    </button>
  );
}

// Where the tab was, kept while the app is open: a round started from a
// class returns to that class, not to the list of classes.
let lastRoute = { name: "home" };

export default function Classroom({ state, invite, onFocus, onStartClass }) {
  const [route, setRouteState] = useState(() => (invite ? { name: "home" } : lastRoute));
  const setRoute = (r) => { lastRoute = r; setRouteState(r); };
  // Everything but the list of classes is a screen of its own, and wants the
  // whole of it.
  useEffect(() => {
    onFocus?.(route.name !== "home");
    return () => onFocus?.(false);
  }, [route.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!initData()) {
    return (
      <div className="screen">
        <ScreenHead title="Class" sub="Learn with your teacher" />
        <div className="empty">
          <div className="empty-big">🏫</div>
          <div>{REASONS.telegram}</div>
        </div>
      </div>
    );
  }

  const home = () => setRoute({ name: "home" });
  if (route.name === "create") {
    return <CreateClass onBack={home} onCreated={(id) => setRoute({ name: "class", id })} />;
  }
  const toClass = () => setRoute({ name: "class", id: route.id });
  if (route.name === "class") {
    return (
      <ClassView
        key={route.id}
        state={state}
        id={route.id}
        onBack={home}
        onStudent={(student) => setRoute({ name: "student", id: route.id, student })}
        onGo={(r) => setRoute({ ...r, id: route.id })}
        onStartClass={onStartClass}
      />
    );
  }
  if (route.name === "package") {
    return <PackageEditor classId={route.id} packageId={route.packageId} onBack={toClass} onSaved={toClass} />;
  }
  if (route.name === "assign") return <AssignScreen packages={route.packages} onBack={toClass} onDone={toClass} />;
  if (route.name === "results") return <AssignmentResults assignmentId={route.assignmentId} onBack={toClass} />;
  if (route.name === "student") {
    return (
      <StudentDetail
        classId={route.id}
        student={route.student}
        onBack={() => setRoute({ name: "class", id: route.id })}
      />
    );
  }
  return (
    <ClassHome
      state={state}
      invite={invite}
      onOpen={(id) => setRoute({ name: "class", id })}
      onCreate={() => setRoute({ name: "create" })}
    />
  );
}

/* ── the list of classes, and joining one ────────────────────────────── */

function ClassHome({ state, invite, onOpen, onCreate }) {
  const [code, setCode] = useState(invite || "");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const { data, error, reload } = useServer(() => classCall("mine", {}, state), []);

  // Sharing accuracy and weak topics follows membership: on while the player
  // belongs to (or has asked to join) any class, off once they have none.
  useEffect(() => {
    if (data) setClassSharing(data.learning.length > 0);
  }, [data]);

  async function join(e) {
    e?.preventDefault();
    if (!/^\d{6}$/.test(code) || busy) return;
    haptic("medium");
    setBusy(true);
    setNote(null);
    try {
      const r = await classCall("join", { code }, state);
      setClassSharing(true);
      setNote({
        ok: true,
        text: r.status === "active"
          ? `You’re already in ${r.class.name}.`
          : `Asked to join ${r.class.name}. You’re in as soon as ${r.class.teacher_name} lets you in.`,
      });
      setCode("");
      reload();
    } catch (err) {
      setNote({ ok: false, text: reasonOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <ScreenHead title="Class" sub="Learn with your teacher" />

      <form className={`class-join${invite ? " invited" : ""}`} onSubmit={join}>
        <div className="section-label" style={{ marginTop: 0 }}>{invite ? "You’re invited" : "Join a class"}</div>
        <div className="game-join">
          <input
            className="gap-input game-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Class code"
          />
          <button className="btn btn-primary game-join-btn" disabled={!/^\d{6}$/.test(code) || busy}>Join</button>
        </div>
        <div className="class-note">
          Your teacher will see your points, day streak, XP, accuracy, weak topics and average
          time — never your saved questions. You can leave any time.
        </div>
        {note && <div className={note.ok ? "class-ok" : "game-warn"}>{note.text}</div>}
      </form>

      {error && !data && <div className="game-warn">{reasonOf(error)}</div>}

      {data?.learning.length > 0 && (
        <>
          <div className="section-label">Your classes</div>
          <div className="class-list">
            {data.learning.map((c) => (
              <button key={c.id} className="class-card" onClick={() => { haptic("light"); onOpen(c.id); }}>
                <span className="class-card-main">
                  <span className="class-card-t">{c.name}</span>
                  <span className="class-card-n">{c.teacher_name}</span>
                </span>
                {c.status === "pending"
                  ? <span className="class-pill">Waiting</span>
                  : <span className="class-go">›</span>}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="section-label">Classes you teach</div>
      {data?.teaching.length > 0 && (
        <div className="class-list">
          {data.teaching.map((c) => (
            <button key={c.id} className="class-card" onClick={() => { haptic("light"); onOpen(c.id); }}>
              <span className="class-card-main">
                <span className="class-card-t">{c.name}</span>
                <span className="class-card-n">
                  {c.students} student{c.students === 1 ? "" : "s"} · code {c.code}
                </span>
              </span>
              {c.waiting > 0 ? <span className="class-pill on">{c.waiting} waiting</span> : <span className="class-go">›</span>}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn-ghost class-create" onClick={() => { haptic("light"); onCreate(); }}>
        Create a classroom
      </button>
    </div>
  );
}

function CreateClass({ onBack, onCreated }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function create(e) {
    e?.preventDefault();
    if (!name.trim() || busy) return;
    haptic("medium");
    setBusy(true);
    setError(null);
    try {
      const r = await classCall("create", { name });
      onCreated(r.class.id);
    } catch (err) {
      setError(reasonOf(err));
      setBusy(false);
    }
  }

  return (
    <form className="screen" onSubmit={create}>
      <BackBar title="New classroom" onBack={onBack} />
      <label className="game-field">
        <span className="section-label">Class name</span>
        <input
          className="gap-input"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="Cardio group, Step 1 — spring…"
          autoFocus
        />
      </label>
      <div className="class-note">
        Students join with a code or an invite link, and you let each one in. You’ll see their
        points, day streak, XP, accuracy, weak topics and average time — all-time and since
        they joined.
      </div>
      {error && <div className="game-warn">{error}</div>}
      <div className="home-cta">
        <button className="btn btn-primary" disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create classroom"}</button>
      </div>
    </form>
  );
}

/* ── one class ───────────────────────────────────────────────────────── */

function ClassView({ state, id, onBack, onStudent, onGo, onStartClass }) {
  const { data, error, reload } = useServer(() => classCall("view", { classId: id }, state), [id]);

  if (!data) {
    return (
      <div className="screen">
        <BackBar title="Class" onBack={onBack} />
        <div className="empty">{error ? reasonOf(error) : "Loading…"}</div>
      </div>
    );
  }
  if (data.role === "teacher") return <TeacherView data={data} onBack={onBack} onStudent={onStudent} reload={reload} onGo={onGo} />;
  return <StudentView data={data} onBack={onBack} onStartClass={onStartClass} />;
}

function Period({ value, onChange }) {
  return (
    <div className="period" role="tablist" aria-label="Period">
      {[["all", "All time"], ["since", "Since joining"]].map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          className={`period-opt${value === key ? " on" : ""}`}
          onClick={() => { if (value !== key) { haptic("light"); onChange(key); } }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TeacherView({ data, onBack, onStudent, reload, onGo }) {
  const [period, setPeriod] = useState("all");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(data.class.name);
  const [error, setError] = useState(null);
  const cls = data.class;
  const link = `${APP_LINK}?startapp=${classInviteParam(cls.code)}`;

  async function act(action, body) {
    setError(null);
    try {
      await classCall(action, { classId: cls.id, ...body });
      return true;
    } catch (err) {
      setError(reasonOf(err));
      return false;
    }
  }

  return (
    <div className="screen rating">
      <BackBar title={cls.name} onBack={onBack} />

      <div className="game-code-card">
        <span className="perf-points-l">Class code</span>
        <span className="game-code">{cls.code.slice(0, 3)} {cls.code.slice(3)}</span>
        <span className="game-code-about">
          {data.students.length} of {data.limits.students} students
        </span>
        <button
          className="btn btn-primary game-share"
          onClick={() => { haptic("medium"); share(classInviteMessage({ name: cls.name, code: cls.code, link })); }}
        >
          Share invite
        </button>
      </div>

      {error && <div className="game-warn" style={{ marginTop: 12 }}>{error}</div>}

      {data.requests.length > 0 && (
        <>
          <div className="section-label">Waiting to join · {data.requests.length}</div>
          <div className="board">
            {data.requests.map((r) => (
              <div key={r.player} className="board-row">
                <span className="board-who">
                  <span className="board-name">{r.name}</span>
                  {r.username && <span className="board-user">@{r.username}</span>}
                </span>
                <span className="req-actions">
                  <button className="set-btn" onClick={async () => { haptic("light"); if (await act("approve", { player: r.player, accept: false })) reload(); }}>
                    Decline
                  </button>
                  <button className="set-btn yes" onClick={async () => { haptic("success"); if (await act("approve", { player: r.player, accept: true })) reload(); }}>
                    Let in
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>Students</span>
        <span className="game-count">By points</span>
      </div>
      <Period value={period} onChange={setPeriod} />
      {data.students.length ? (
        <div className="board">
          {data.students.map((s, i) => {
            const n = period === "since" ? s.since : s.all;
            return (
              <button key={s.player} className="board-row student-row" onClick={() => { haptic("light"); onStudent(s); }}>
                <span className="board-place"><PlaceMark place={i + 1} /></span>
                <span className="board-who">
                  <span className="board-name">{s.name}</span>
                  <span className="board-user">
                    {n
                      ? period === "since"
                        ? `+${n.xp.toLocaleString()} XP · ${n.answered} answered · ${pct(n.accuracy)} · ${formatPace(n.pace)}`
                        : `🔥 ${n.streak} · ${n.xp.toLocaleString()} XP · ${pct(n.accuracy)} · ${formatPace(n.pace)}`
                      : "Joined before this was kept"}
                  </span>
                </span>
                <span className="board-value">{n ? (period === "since" ? signed(n.points) : n.points) : "—"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="board"><div className="board-empty">No students yet. Share the invite, then let them in here.</div></div>
      )}

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>Question packages</span>
        <span className="game-count">{data.packages.length}</span>
      </div>
      {data.packages.length ? (
        <div className="class-list">
          {data.packages.map((p) => (
            <button key={p.id} className="class-card" onClick={() => { haptic("light"); onGo({ name: "package", packageId: p.id }); }}>
              <span className="class-card-main">
                <span className="class-card-t">{p.name}</span>
                <span className="class-card-n">{p.count} question{p.count === 1 ? "" : "s"}</span>
              </span>
              <span className="class-go">›</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="class-note">Your own sets of questions: write them, or pick them from usmleengo’s bank. Only this class sees them.</div>
      )}
      <button className="btn btn-ghost class-create" onClick={() => { haptic("light"); onGo({ name: "package" }); }}>New package</button>

      <div className="section-label">Homework</div>
      {data.assignments.length ? (
        <div className="class-list">
          {data.assignments.map((a) => (
            <button key={a.id} className="class-card" onClick={() => { haptic("light"); onGo({ name: "results", assignmentId: a.id }); }}>
              <span className="class-card-main">
                <span className="class-card-t">{a.title}</span>
                <span className="class-card-n">Due {dayText(a.dueAt)} · {a.done} of {data.students.length} handed in</span>
              </span>
              <span className="class-go">›</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="class-note">Set a package as homework with a due date, and see each student’s score and each question’s.</div>
      )}
      <button
        className="btn btn-ghost class-create"
        disabled={!data.packages.length}
        onClick={() => { haptic("light"); onGo({ name: "assign", packages: data.packages }); }}
      >
        Set homework
      </button>

      <div className="section-label">This class</div>
      {renaming ? (
        <form
          className="game-join"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            if (await act("rename", { name: newName })) { setRenaming(false); reload(); }
          }}
        >
          <input className="gap-input" value={newName} maxLength={40} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <button className="btn btn-primary game-join-btn" disabled={!newName.trim()}>Save</button>
        </form>
      ) : (
        <button className="btn btn-ghost" onClick={() => { haptic("light"); setRenaming(true); }}>Rename</button>
      )}
      <TwoTap
        label="Close this class"
        confirm="Tap again: close it for everyone"
        onConfirm={async () => { if (await act("close")) onBack(); }}
      />
    </div>
  );
}

function StudentDetail({ classId, student, onBack }) {
  const [period, setPeriod] = useState("all");
  const [error, setError] = useState(null);
  const n = period === "since" ? student.since : student.all;

  const tiles = n ? [
    { label: period === "since" ? "Points gained" : "Points", value: period === "since" ? signed(n.points) : n.points, sub: period === "all" ? `Rank #${n.rank}` : "since joining" },
    { label: "Day streak", value: n.streak, sub: n.streak === 1 ? "day" : "days" },
    { label: "XP", value: n.xp.toLocaleString(), sub: `${n.answered.toLocaleString()} answered` },
    { label: "Accuracy", value: pct(n.accuracy), sub: "right answers" },
    { label: "Average time", value: formatPace(n.pace), sub: "per right answer" },
  ] : [];

  return (
    <div className="screen rating">
      <BackBar title={student.name} onBack={onBack} />
      {student.username && <div className="sub class-user">@{student.username}</div>}
      <Period value={period} onChange={setPeriod} />

      {n ? (
        <>
          <div className="class-tiles">
            {tiles.map((t) => (
              <div key={t.label} className="class-tile">
                <span className="perf-label">{t.label}</span>
                <span className="class-tile-v">{t.value}</span>
                <span className="perf-detail">{t.sub}</span>
              </div>
            ))}
          </div>

          <div className="section-label">Weak topics</div>
          {n.weak.length ? (
            <div className="weak-list">
              {n.weak.map((w) => (
                <div key={w.tag} className="weak-row">
                  <span className="weak-name">
                    {tagLabel(w.tag)}
                    <small>{w.answered} answered</small>
                  </span>
                  <span className="weak-bar">
                    <span className={`weak-fill${w.pct < 60 ? " low" : w.pct < 80 ? " mid" : ""}`} style={{ width: `${w.pct}%` }} />
                  </span>
                  <span className={`weak-pct${w.pct < 60 ? " low" : w.pct < 80 ? " mid" : ""}`}>{w.pct}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="class-note">Not enough answers in any category yet — five are needed to judge one.</div>
          )}
        </>
      ) : (
        <div className="empty">Nothing to show since joining yet.</div>
      )}

      {error && <div className="game-warn" style={{ marginTop: 12 }}>{error}</div>}
      <div className="home-cta">
        <TwoTap
          label="Remove from class"
          confirm={`Tap again to remove ${student.name}`}
          onConfirm={async () => {
            try { await classCall("remove", { classId, player: student.player }); onBack(); }
            catch (err) { setError(reasonOf(err)); }
          }}
        />
      </div>
    </div>
  );
}

function StudentView({ data, onBack, onStartClass }) {
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(null);
  const cls = data.class;

  /** Fetch a package and play it: as homework the first time, as practice after. */
  async function play(packageId, title, assignmentId) {
    if (opening) return;
    haptic("medium");
    setOpening(packageId);
    setError(null);
    try {
      const r = await classCall("package", { packageId });
      onStartClass({ questions: r.package.questions, label: title, assignmentId });
    } catch (err) {
      setError(reasonOf(err));
    } finally {
      setOpening(null);
    }
  }

  async function leave() {
    try {
      await classCall("remove", { classId: cls.id });
      onBack();
    } catch (err) {
      setError(reasonOf(err));
    }
  }

  if (data.status === "pending") {
    return (
      <div className="screen">
        <BackBar title={cls.name} onBack={onBack} />
        <div className="empty">
          <div className="empty-big">⏳</div>
          <div>Waiting for {cls.teacherName} to let you in.</div>
        </div>
        {error && <div className="game-warn">{error}</div>}
        <div className="home-cta">
          <TwoTap label="Cancel my request" confirm="Tap again to cancel" onConfirm={leave} />
        </div>
      </div>
    );
  }

  const top = data.ranking.top;
  const me = data.ranking.me;
  const meBelow = me && me.place > 10 ? { place: me.place, points: me.points } : null;
  return (
    <div className="screen rating">
      <BackBar title={cls.name} onBack={onBack} />
      <div className="sub class-user">
        Teacher: {cls.teacherName}{cls.teacherUsername ? ` · @${cls.teacherUsername}` : ""} · {data.students} student{data.students === 1 ? "" : "s"}
      </div>

      {me && (
        <div className="rating-place">
          <span className="rating-rank">Your place in class <b>#{me.place} / {me.total}</b></span>
          <b>{me.points} <small>pts</small></b>
        </div>
      )}

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>Class ranking · by points</span>
      </div>
      <div className="board">
        <div className="board-head">
          <span className="board-place">Rank</span>
          <span className="board-who">Name</span>
          <span className="board-value">Points</span>
        </div>
        {top.map((r) => (
          <div key={`${r.place}-${r.name}`} className={`board-row${r.isMe ? " me" : ""}${r.place <= 3 ? ` p${r.place}` : ""}`}>
            <span className="board-place"><PlaceMark place={r.place} /></span>
            <span className="board-who">
              <span className="board-name">{r.isMe ? "You" : r.name}</span>
              {!r.isMe && r.username && <span className="board-user">@{r.username}</span>}
            </span>
            <span className="board-value">{r.points}</span>
          </div>
        ))}
        {meBelow && (
          <>
            <div className="board-gap" aria-hidden="true">⋯</div>
            <div className="board-row me">
              <span className="board-place">{meBelow.place}</span>
              <span className="board-who"><span className="board-name">You</span></span>
              <span className="board-value">{meBelow.points}</span>
            </div>
          </>
        )}
      </div>

      <div className="section-label">Homework</div>
      {data.assignments.length ? (
        <div className="class-list">
          {data.assignments.map((a) => {
            const overdue = !a.mine && a.dueAt < Date.now();
            return (
              <button key={a.id} className="class-card" onClick={() => play(a.packageId, a.title, a.mine ? null : a.id)}>
                <span className="class-card-main">
                  <span className="class-card-t">{a.title}</span>
                  <span className="class-card-n">
                    {a.mine
                      ? `Handed in · ${a.mine.score}/${a.mine.total}${a.mine.late ? " · late" : ""}`
                      : `Due ${dayText(a.dueAt)}${overdue ? " · overdue" : ""}`}
                  </span>
                </span>
                <span className={`class-pill${a.mine ? "" : " on"}`}>{a.mine ? "Practise" : "Start"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="class-note">No homework yet.</div>
      )}

      {data.packages.length > 0 && (
        <>
          <div className="section-label">Practice</div>
          <div className="class-list">
            {data.packages.map((p) => (
              <button key={p.id} className="class-card" onClick={() => play(p.id, p.name, null)}>
                <span className="class-card-main">
                  <span className="class-card-t">{p.name}</span>
                  <span className="class-card-n">{p.count} question{p.count === 1 ? "" : "s"} · not counted anywhere</span>
                </span>
                <span className="class-go">{opening === p.id ? "…" : "›"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {error && <div className="game-warn" style={{ marginTop: 12 }}>{error}</div>}
      <div className="home-cta">
        <TwoTap label="Leave this class" confirm="Tap again to leave" onConfirm={leave} />
      </div>
    </div>
  );
}


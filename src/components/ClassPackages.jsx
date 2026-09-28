import React, { useEffect, useMemo, useRef, useState } from "react";
import bank from "../data/bank.js";
import { bankToClass, classCall, imageUrl, uploadImage } from "../lib/classApi.js";
import { search, subjects } from "../lib/match.js";
import { PICTURE_TAGS, tagLabel } from "../lib/tags.js";
import { haptic } from "../lib/telegram.js";
import { BackBar } from "./Chrome.jsx";

// The teacher's side of question packages and homework: writing and picking
// questions, setting a package as homework, and seeing how it went.

export const MAX_OPTIONS = 10;
const MAX_QUESTIONS = 300;

const REASONS = {
  offline: "Couldn’t reach the server. Check your internet and try again.",
  name: "Give the package a name.",
  questions: "Add at least one question.",
  question: "One of the questions is incomplete.",
  "too-many-packages": "This class has the most packages it can hold.",
  "too-many-assignments": "This class has the most homework it can hold.",
  due: "Pick a due date in the future, within a year.",
  "image-too-large": "That picture is too large, even shrunk.",
  "image-type": "Only pictures can be added.",
  image: "That picture couldn’t be read.",
  "too-many-images": "This class has the most pictures it can hold.",
};
export const reasonOf = (err) => REASONS[err?.code] || "Something went wrong. Try again.";

let seq = 0;
const newId = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`;
const blankQuestion = () => ({ id: newId(), type: "choice", q: "", options: ["", ""], answer: 0, explain: "" });

/** "Fri 3 Oct". */
export const dayText = (ms) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** What is missing from a question, or null if it is complete. */
function problemOf(q) {
  if (!q.q.trim() && !q.img) return "Write the question, or add a picture.";
  if (q.type === "choice") {
    if (q.options.some((o) => !o.trim())) return "Fill in every option, or remove the empty ones.";
    if (q.options.length < 2) return "A question needs at least two options.";
  } else if (!String(q.answer || "").trim()) {
    return "Write the answer.";
  }
  return null;
}

/* ── a package ───────────────────────────────────────────────────────── */

export function PackageEditor({ classId, packageId, onBack, onSaved }) {
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState(packageId ? null : []);
  const [editing, setEditing] = useState(null); // index, or "new"
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!packageId) return;
    classCall("package", { packageId })
      .then((r) => { setName(r.package.name); setQuestions(r.package.questions); })
      .catch((err) => setError(reasonOf(err)));
  }, [packageId]);

  if (editing !== null) {
    const isNew = editing === "new";
    return (
      <QuestionEditor
        classId={classId}
        initial={isNew ? blankQuestion() : questions[editing]}
        number={isNew ? questions.length + 1 : editing + 1}
        onCancel={() => setEditing(null)}
        onDelete={isNew ? null : () => { setQuestions((qs) => qs.filter((_, i) => i !== editing)); setEditing(null); }}
        onSave={(q) => {
          setQuestions((qs) => (isNew ? [...qs, q] : qs.map((x, i) => (i === editing ? q : x))));
          setEditing(null);
        }}
      />
    );
  }
  if (picking) {
    return (
      <BankPicker
        have={new Set((questions || []).map((q) => q.id))}
        room={MAX_QUESTIONS - (questions || []).length}
        onCancel={() => setPicking(false)}
        onAdd={(picked) => { setQuestions((qs) => [...qs, ...picked.map(bankToClass)]); setPicking(false); }}
      />
    );
  }

  async function save() {
    haptic("medium");
    setBusy(true);
    setError(null);
    try {
      await classCall("savepackage", { classId, package: { id: packageId || undefined, name, questions } });
      onSaved();
    } catch (err) {
      setError(err.code === "question" && Number.isInteger(err.index)
        ? `Question ${err.index + 1} is incomplete.`
        : reasonOf(err));
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await classCall("deletepackage", { packageId });
      onSaved();
    } catch (err) {
      setError(reasonOf(err));
    }
  }

  if (!questions) {
    return (
      <div className="screen">
        <BackBar title="Package" onBack={onBack} />
        <div className="empty">{error || "Loading…"}</div>
      </div>
    );
  }

  return (
    <div className="screen">
      <BackBar title={packageId ? "Edit package" : "New package"} onBack={onBack} />
      <label className="game-field">
        <span className="section-label">Package name</span>
        <input className="gap-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Acid–base, week 3…" />
      </label>

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>Questions</span>
        <span className="game-count">{questions.length} / {MAX_QUESTIONS}</span>
      </div>
      {questions.length ? (
        <div className="pkg-list">
          {questions.map((q, i) => (
            <button key={q.id} className="pkg-q" onClick={() => { haptic("light"); setEditing(i); }}>
              <span className="pkg-n">{i + 1}</span>
              <span className="pkg-text">
                {q.q || (q.img ? "Picture question" : "—")}
                <small>
                  {q.type === "choice" ? `${q.options.length} options` : "Typed answer"}
                  {q.img ? " · picture" : ""}
                  {q.id.startsWith("b-") ? " · from usmleengo" : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="class-note">No questions yet. Write your own, or add some from usmleengo’s bank.</div>
      )}

      <div className="pkg-add">
        <button className="btn btn-ghost" disabled={questions.length >= MAX_QUESTIONS} onClick={() => { haptic("light"); setEditing("new"); }}>
          Write a question
        </button>
        <button className="btn btn-ghost" disabled={questions.length >= MAX_QUESTIONS} onClick={() => { haptic("light"); setPicking(true); }}>
          Add from usmleengo
        </button>
      </div>

      {packageId && (
        <DeleteButton label="Delete this package" confirm="Tap again: delete it and its homework" onConfirm={remove} />
      )}

      <div className="home-cta">
        {error && <div className="game-warn">{error}</div>}
        <button className="btn btn-primary" disabled={busy || !name.trim() || !questions.length} onClick={save}>
          {busy ? "Saving…" : "Save package"}
        </button>
      </div>
    </div>
  );
}

function DeleteButton({ label, confirm, onConfirm }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      className={`btn ${armed ? "btn-danger" : "btn-ghost"} class-two-tap`}
      onClick={() => { haptic(armed ? "warning" : "light"); if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
    >
      {armed ? confirm : label}
    </button>
  );
}

/* ── one question ────────────────────────────────────────────────────── */

export function QuestionEditor({ classId, initial, number, onSave, onCancel, onDelete }) {
  const [q, setQ] = useState(() => ({
    ...initial,
    options: initial.type === "choice" ? [...initial.options] : ["", ""],
    answer: initial.type === "choice" ? initial.answer : 0,
    typed: initial.type === "typed" ? initial.answer : "",
    also: initial.type === "typed" ? (initial.accept || []).filter((a) => a.toLowerCase() !== String(initial.answer).toLowerCase()).join(", ") : "",
  }));
  const [problem, setProblem] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const set = (patch) => { setProblem(null); setQ((x) => ({ ...x, ...patch })); };

  function done() {
    const out = { id: q.id, type: q.type, q: q.q.trim(), explain: (q.explain || "").trim() };
    if (q.topic) out.topic = q.topic;
    if (q.img) out.img = q.img;
    if (q.type === "choice") {
      out.options = q.options.map((o) => o.trim());
      out.answer = q.answer;
    } else {
      out.answer = q.typed.trim();
      out.accept = [out.answer, ...q.also.split(",").map((s) => s.trim()).filter(Boolean)];
    }
    const p = problemOf(out);
    if (p) { setProblem(p); return; }
    haptic("success");
    onSave(out);
  }

  async function pickPicture(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setProblem(null);
    try {
      set({ img: await uploadImage(classId, file) });
    } catch (err) {
      setProblem(reasonOf(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="screen">
      <BackBar title={`Question ${number}`} onBack={onCancel} />

      <div className="period" role="tablist" aria-label="Answer type">
        {[["choice", "Options to tap"], ["typed", "Typed answer"]].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={q.type === key} className={`period-opt${q.type === key ? " on" : ""}`}
            onClick={() => { haptic("light"); set({ type: key }); }}>
            {label}
          </button>
        ))}
      </div>

      <label className="game-field">
        <span className="section-label">Question</span>
        <textarea className="gap-input qe-text" rows={4} value={q.q} maxLength={2000}
          onChange={(e) => set({ q: e.target.value })}
          placeholder={q.type === "typed" ? "Dementia, diarrhea and dermatitis = deficiency of vitamin ___" : "A 25-year-old woman has fatigue and pale conjunctivae. Most likely deficiency?"} />
      </label>

      <div className="qe-picture">
        {q.img ? (
          <>
            <img src={imageUrl(q.img)} alt="" />
            <button className="chips-clear" onClick={() => set({ img: undefined })}>Remove picture</button>
          </>
        ) : (
          <button className="btn btn-ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Adding the picture…" : "Add a picture"}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPicture} />
      </div>

      {q.type === "choice" ? (
        <>
          <div className="section-label">Options — tap the circle by the right one</div>
          <div className="qe-options">
            {q.options.map((o, i) => (
              <div key={i} className={`qe-option${q.answer === i ? " right" : ""}`}>
                <button className="qe-radio" aria-label={`Option ${i + 1} is right`} aria-pressed={q.answer === i}
                  onClick={() => { haptic("light"); set({ answer: i }); }}>
                  {q.answer === i ? "✓" : ""}
                </button>
                <input className="gap-input" value={o} maxLength={400} placeholder={`Option ${String.fromCharCode(65 + i)}`}
                  onChange={(e) => set({ options: q.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                {q.options.length > 2 && (
                  <button className="qe-x" aria-label={`Remove option ${i + 1}`}
                    onClick={() => set({
                      options: q.options.filter((_, j) => j !== i),
                      answer: q.answer === i ? 0 : q.answer > i ? q.answer - 1 : q.answer,
                    })}>
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {q.options.length < MAX_OPTIONS && (
            <button className="chips-clear qe-more" onClick={() => set({ options: [...q.options, ""] })}>+ Add an option</button>
          )}
        </>
      ) : (
        <>
          <label className="game-field">
            <span className="section-label">Answer</span>
            <input className="gap-input" value={q.typed} maxLength={200} onChange={(e) => set({ typed: e.target.value })} placeholder="B3" />
          </label>
          <label className="game-field">
            <span className="section-label">Also accept (optional, separated by commas)</span>
            <input className="gap-input" value={q.also} onChange={(e) => set({ also: e.target.value })} placeholder="niacin, vitamin b3" />
          </label>
          <div className="class-note" style={{ marginTop: -6 }}>Small typos in longer answers are forgiven, as in the app’s own questions.</div>
        </>
      )}

      <label className="game-field" style={{ marginTop: 12 }}>
        <span className="section-label">Explanation (optional)</span>
        <textarea className="gap-input qe-text" rows={3} value={q.explain || ""} maxLength={2000}
          onChange={(e) => set({ explain: e.target.value })} placeholder="Shown after the answer." />
      </label>

      {onDelete && <DeleteButton label="Delete this question" confirm="Tap again to delete it" onConfirm={onDelete} />}

      <div className="home-cta">
        {problem && <div className="game-warn">{problem}</div>}
        <button className="btn btn-primary" disabled={uploading} onClick={done}>Done</button>
      </div>
    </div>
  );
}

/* ── picking from the usmleengo bank ─────────────────────────────────── */

function BankPicker({ have, room, onAdd, onCancel }) {
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState(null);
  const [picked, setPicked] = useState(() => new Map());
  const chips = useMemo(() => [...PICTURE_TAGS, ...subjects().slice(0, 12).map((s) => s.tag)], []);
  const shown = useMemo(() => {
    const list = query.trim() ? search(query, 80) : tag ? bank.filter((q) => q.tags.includes(tag)).slice(0, 80) : [];
    return list.filter((q) => !have.has(`b-${q.id}`.slice(0, 40)));
  }, [query, tag, have]);

  function toggle(q) {
    haptic("light");
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(q.id)) next.delete(q.id);
      else if (next.size < room) next.set(q.id, q);
      return next;
    });
  }

  return (
    <div className="screen">
      <BackBar title="Add from usmleengo" onBack={onCancel} />
      <div className="search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a topic — addison, niacin…" autoComplete="off" />
      </div>
      {!query.trim() && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {chips.map((t) => (
            <button key={t} className={`chip${tag === t ? " on" : ""}`} onClick={() => { haptic("light"); setTag(tag === t ? null : t); }}>
              {tagLabel(t)}
            </button>
          ))}
        </div>
      )}
      {shown.length ? (
        <div className="pkg-list">
          {shown.map((q) => (
            <button key={q.id} className={`pkg-q pick${picked.has(q.id) ? " on" : ""}`} onClick={() => toggle(q)} aria-pressed={picked.has(q.id)}>
              <span className="qe-radio">{picked.has(q.id) ? "✓" : ""}</span>
              <span className="pkg-text">
                {q.q || "Picture question"}
                <small>{q.topic} · {q.type === "gap" ? "typed" : `${q.options.length} options`}{q.img ? " · picture" : ""}</small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="class-note">{query.trim() || tag ? "Nothing new to add here." : "Search, or pick a category."}</div>
      )}
      <div className="home-cta">
        <button className="btn btn-primary" disabled={!picked.size} onClick={() => { haptic("medium"); onAdd([...picked.values()]); }}>
          {picked.size ? `Add ${picked.size} question${picked.size === 1 ? "" : "s"}` : "Pick questions to add"}
        </button>
      </div>
    </div>
  );
}

/* ── homework ────────────────────────────────────────────────────────── */

export function AssignScreen({ packages, onBack, onDone }) {
  const [packageId, setPackageId] = useState(packages[0]?.id || null);
  const [title, setTitle] = useState("");
  const inAWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const [date, setDate] = useState(inAWeek);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const chosen = packages.find((p) => p.id === packageId);

  async function assign() {
    haptic("medium");
    setBusy(true);
    setError(null);
    // Due at the end of the chosen day, on the teacher's clock.
    const dueAt = new Date(`${date}T23:59:00`).getTime();
    try {
      await classCall("assign", { packageId, title: title.trim() || chosen?.name, dueAt });
      onDone();
    } catch (err) {
      setError(reasonOf(err));
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <BackBar title="Set homework" onBack={onBack} />
      <div className="section-label">Package</div>
      <div className="opt-list">
        {packages.map((p) => (
          <button key={p.id} className={`opt-row${p.id === packageId ? " on" : ""}`} onClick={() => { haptic("light"); setPackageId(p.id); }}>
            <div>
              <div className="opt-name">{p.name}</div>
              <div className="opt-note">{p.count} question{p.count === 1 ? "" : "s"}</div>
            </div>
            <span className="tick">{p.id === packageId ? "✓" : ""}</span>
          </button>
        ))}
      </div>
      <label className="game-field" style={{ marginTop: 14 }}>
        <span className="section-label">Title (optional)</span>
        <input className="gap-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder={chosen?.name || ""} />
      </label>
      <label className="game-field">
        <span className="section-label">Due by the end of</span>
        <input className="gap-input" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="class-note">Each student’s first try is the one that counts. Try-agains after that are practice.</div>
      <div className="home-cta">
        {error && <div className="game-warn">{error}</div>}
        <button className="btn btn-primary" disabled={busy || !packageId || !date} onClick={assign}>
          {busy ? "Setting it…" : "Set homework"}
        </button>
      </div>
    </div>
  );
}

export function AssignmentResults({ assignmentId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    classCall("results", { assignmentId }).then(setData).catch((err) => setError(reasonOf(err)));
  }, [assignmentId]);

  async function remove() {
    try {
      await classCall("unassign", { assignmentId });
      onBack();
    } catch (err) {
      setError(reasonOf(err));
    }
  }

  if (!data) {
    return (
      <div className="screen">
        <BackBar title="Homework" onBack={onBack} />
        <div className="empty">{error || "Loading…"}</div>
      </div>
    );
  }

  const done = data.students.filter((s) => s.done);
  const band = (pct) => (pct < 60 ? " low" : pct < 80 ? " mid" : "");
  return (
    <div className="screen rating">
      <BackBar title={data.assignment.title} onBack={onBack} />
      <div className="sub class-user">
        {data.assignment.packageName} · due {dayText(data.assignment.dueAt)} · {done.length} of {data.students.length} handed in
      </div>

      <div className="section-label">Students</div>
      <div className="board">
        {data.students.map((s) => (
          <div key={s.player} className="board-row">
            <span className="board-who">
              <span className="board-name">{s.name}</span>
              <span className="board-user">
                {s.done ? `Handed in ${dayText(s.finishedAt)}${s.late ? " · late" : ""}` : "Not yet"}
              </span>
            </span>
            <span className="board-value">{s.done ? `${s.score}/${s.total}` : "—"}</span>
          </div>
        ))}
        {!data.students.length && <div className="board-empty">No students in the class yet.</div>}
      </div>

      <div className="section-label">Each question</div>
      <div className="weak-list">
        {data.questions.map((q) => (
          <div key={q.id} className="weak-row">
            <span className="weak-name">
              Q{q.n}
              <small>{q.answered} answered</small>
            </span>
            <span className="res-q">
              <span className="res-text">{q.text}</span>
              {q.pct !== null && <span className="weak-bar"><span className={`weak-fill${band(q.pct)}`} style={{ width: `${q.pct}%` }} /></span>}
            </span>
            <span className={`weak-pct${q.pct === null ? "" : band(q.pct)}`}>{q.pct === null ? "—" : `${q.pct}%`}</span>
          </div>
        ))}
      </div>

      {error && <div className="game-warn" style={{ marginTop: 12 }}>{error}</div>}
      <DeleteButton label="Delete this homework" confirm="Tap again: delete it and its scores" onConfirm={remove} />
    </div>
  );
}

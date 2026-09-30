import React, { useEffect, useMemo, useRef, useState } from "react";
import bank from "../data/bank.js";
import { bankToClass, classCall, imageUrl, uploadImage } from "../lib/classApi.js";
import { search, subjects } from "../lib/match.js";
import { ACCEPTED, FILE_REASONS, readQuestionFile } from "../lib/qfiles.js";
import { dayText, t } from "../lib/i18n.js";
import { formatExample, parseQuestions } from "../lib/qformat.js";
import { PICTURE_TAGS, tagLabel } from "../lib/tags.js";
import { haptic } from "../lib/telegram.js";
import { BackBar } from "./Chrome.jsx";
import { Sheet } from "./Sheet.jsx";

// The teacher's side of question packages and homework: writing and picking
// questions, setting a package as homework, and seeing how it went.

export const MAX_OPTIONS = 10;
const MAX_QUESTIONS = 300;

const reasons = () => ({
  offline: t("Couldn’t reach the server. Check your internet and try again.", "Serverga ulanib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring."),
  name: t("Give the package a name.", "To'plamga nom bering."),
  questions: t("Add at least one question.", "Kamida bitta savol qo'shing."),
  question: t("One of the questions is incomplete.", "Savollardan biri to'liq emas."),
  "too-many-packages": t("This class has the most packages it can hold.", "Bu guruhda to'plamlar soni chegaraga yetgan."),
  "too-many-assignments": t("This class has the most homework it can hold.", "Bu guruhda uy vazifalari soni chegaraga yetgan."),
  due: t("Pick a due date in the future, within a year.", "Bir yil ichidagi kelgusi sanani tanlang."),
  "image-too-large": t("That picture is too large, even shrunk.", "Rasm kichraytirilgandan keyin ham juda katta."),
  "image-type": t("Only pictures can be added.", "Faqat rasm qo'shish mumkin."),
  image: t("That picture couldn’t be read.", "Rasmni o'qib bo'lmadi."),
  "too-many-images": t("This class has the most pictures it can hold.", "Bu guruhda rasmlar soni chegaraga yetgan."),
});
export const reasonOf = (err) => reasons()[err?.code] || t("Something went wrong. Try again.", "Nimadir xato ketdi. Qayta urinib ko'ring.");
const questionsText = (n) => t(`${n} question${n === 1 ? "" : "s"}`, `${n} ta savol`);
const optionsText = (n) => t(`${n} options`, `${n} ta variant`);

let seq = 0;
const newId = () => `q${Date.now().toString(36)}${(seq++).toString(36)}`;
const blankQuestion = () => ({ id: newId(), type: "choice", q: "", options: ["", ""], answer: -1, explain: "" });

/** What is missing from a question, or null if it is complete. */
function problemOf(q) {
  if (!q.q.trim() && !q.img) return t("Write the question, or add a picture.", "Savolni yozing yoki rasm qo'shing.");
  if (q.type === "choice") {
    if (q.options.some((o) => !o.trim())) return t("Fill in every option, or remove the empty ones.", "Barcha variantlarni to'ldiring yoki bo'shlarini olib tashlang.");
    if (q.options.length < 2) return t("A question needs at least two options.", "Savolda kamida ikkita variant bo'lishi kerak.");
    if (!(q.answer >= 0 && q.answer < q.options.length)) return t("Tap the circle by the right option.", "To'g'ri variant yonidagi doirachani bosing.");
  } else if (!String(q.answer || "").trim()) {
    return t("Write the answer.", "Javobni yozing.");
  }
  return null;
}

/* ── a package ───────────────────────────────────────────────────────── */

export function PackageEditor({ classId, packageId, incomingFile = null, onBack, onSaved }) {
  const [name, setName] = useState("");
  const [questions, setQuestions] = useState(packageId ? null : []);
  const [editing, setEditing] = useState(null); // index, or "new"
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState(null); // { fileName, items, stray }
  const [reading, setReading] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!packageId) return;
    classCall("package", { packageId })
      .then((r) => { setName(r.package.name); setQuestions(r.package.questions); })
      .catch((err) => setError(reasonOf(err)));
  }, [packageId]);

  /** Read a question file on the phone and show what was found in it. */
  async function importFile(file) {
    setReading(true);
    setError(null);
    try {
      const { questions: found, stray } = parseQuestions(await readQuestionFile(file));
      if (!found.length) {
        setError(t("No questions found in that file. Number each question and put its options under it — see “How to write the file”.",
          "Faylda savol topilmadi. Har bir savolni raqamlang va variantlarini uning ostiga yozing — «Faylni qanday yozish kerak» bo'limiga qarang."));
      } else {
        setPreview({ fileName: file.name, stray, items: found.map((parsed) => ({ parsed, fixed: null, skip: false })) });
        // An unnamed package takes the file's name, which the teacher can change.
        setName((n) => n || file.name.replace(/\.[^.]+$/, "").slice(0, 60));
      }
    } catch (err) {
      setError(FILE_REASONS()[err?.code] || t("That file couldn’t be read.", "Faylni o'qib bo'lmadi."));
    } finally {
      setReading(false);
    }
  }

  // A file sent to the bot arrives already chosen.
  useEffect(() => { if (incomingFile) importFile(incomingFile); }, [incomingFile]); // eslint-disable-line react-hooks/exhaustive-deps

  if (preview) {
    return (
      <ImportPreview
        classId={classId}
        preview={preview}
        room={MAX_QUESTIONS - (questions || []).length}
        onChange={setPreview}
        onCancel={() => setPreview(null)}
        onAdd={(added) => { setQuestions((qs) => [...(qs || []), ...added]); setPreview(null); }}
      />
    );
  }

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
        ? t(`Question ${err.index + 1} is incomplete.`, `${err.index + 1}-savol to'liq emas.`)
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
        <BackBar title={t("Package", "To'plam")} onBack={onBack} />
        <div className="empty">{error || t("Loading…", "Yuklanmoqda…")}</div>
      </div>
    );
  }

  return (
    <div className="screen">
      <BackBar title={packageId ? t("Edit package", "To'plamni tahrirlash") : t("New package", "Yangi to'plam")} onBack={onBack} />
      <label className="game-field">
        <span className="section-label">{t("Package name", "To'plam nomi")}</span>
        <input className="gap-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("Acid–base, week 3…", "Kislota-ishqor, 3-hafta…")} />
      </label>

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>{t("Questions", "Savollar")}</span>
        <span className="game-count">{questions.length} / {MAX_QUESTIONS}</span>
      </div>
      {questions.length ? (
        <div className="pkg-list">
          {questions.map((q, i) => (
            <button key={q.id} className="pkg-q" onClick={() => { haptic("light"); setEditing(i); }}>
              <span className="pkg-n">{i + 1}</span>
              <span className="pkg-text">
                {q.q || (q.img ? t("Picture question", "Rasmli savol") : "—")}
                <small>
                  {q.type === "choice" ? optionsText(q.options.length) : t("Typed answer", "Yozma javob")}
                  {q.img ? t(" · picture", " · rasm") : ""}
                  {q.id.startsWith("b-") ? t(" · from usmleengo", " · usmleengodan") : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="class-note">
          {t("No questions yet. Write your own, or add some from usmleengo’s bank.", "Hali savollar yo'q. O'zingiz yozing yoki usmleengo bazasidan qo'shing.")}
        </div>
      )}

      <div className="pkg-add">
        <button className="btn btn-ghost" disabled={questions.length >= MAX_QUESTIONS} onClick={() => { haptic("light"); setEditing("new"); }}>
          {t("Write a question", "Savol yozish")}
        </button>
        <button className="btn btn-ghost" disabled={questions.length >= MAX_QUESTIONS} onClick={() => { haptic("light"); setPicking(true); }}>
          {t("Add from usmleengo", "usmleengodan qo'shish")}
        </button>
        <button
          className="btn btn-ghost pkg-import"
          disabled={reading || questions.length >= MAX_QUESTIONS}
          onClick={() => { haptic("light"); fileRef.current?.click(); }}
        >
          {reading ? t("Reading the file…", "Fayl o'qilmoqda…") : t("Import a file — Word, PDF, web page or text", "Fayldan yuklash — Word, PDF, veb-sahifa yoki matn")}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }}
      />
      <button className="chips-clear pkg-format" onClick={() => { haptic("light"); setShowFormat(true); }}>
        {t("How to write the file", "Faylni qanday yozish kerak")}
      </button>
      {showFormat && <FormatSheet onClose={() => setShowFormat(false)} />}

      {packageId && (
        <DeleteButton label={t("Delete this package", "To'plamni o'chirish")}
          confirm={t("Tap again: delete it and its homework", "Yana bosing: to'plam va uning uy vazifalari o'chiriladi")} onConfirm={remove} />
      )}

      <div className="home-cta">
        {error && <div className="game-warn">{error}</div>}
        <button className="btn btn-primary" disabled={busy || !name.trim() || !questions.length} onClick={save}>
          {busy ? t("Saving…", "Saqlanmoqda…") : t("Save package", "To'plamni saqlash")}
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

/* ── importing a file ────────────────────────────────────────────────── */

/** A question read from a file, in the shape a package keeps. */
function fromParsed(p) {
  const q = { id: newId(), type: p.type, q: p.q, explain: p.explain || "" };
  if (p.topic) q.topic = p.topic;
  if (p.type === "choice") {
    q.options = p.options.slice(0, MAX_OPTIONS);
    // No answer in the file stays no answer: the teacher taps the right one.
    q.answer = p.answer >= 0 && p.answer < q.options.length ? p.answer : -1;
  } else {
    q.answer = p.answer;
    q.accept = p.accept;
  }
  return q;
}

/**
 * What a file turned into, before any of it is kept. Complete questions go
 * straight in; one the reader could not finish is flagged, and tapping it
 * opens it to fix. Pictures are uploaded only when the questions are added.
 */
function ImportPreview({ classId, preview, room, onChange, onCancel, onAdd }) {
  const [fixing, setFixing] = useState(null); // { index, question }
  const [adding, setAdding] = useState(null);
  const [error, setError] = useState(null);
  const urls = useMemo(
    () => preview.items.map((it) => (it.parsed.image ? URL.createObjectURL(it.parsed.image) : null)),
    [preview.items],
  );
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);

  const items = preview.items;
  const ready = items.filter((it) => !it.skip && (it.fixed || !it.parsed.problem));
  const broken = items.filter((it) => !it.skip && !it.fixed && it.parsed.problem);
  const update = (index, patch) => onChange({ ...preview, items: items.map((it, i) => (i === index ? { ...it, ...patch } : it)) });

  async function openFix(index) {
    const it = items[index];
    haptic("light");
    setError(null);
    let question = it.fixed || fromParsed(it.parsed);
    if (!it.fixed && it.parsed.image) {
      try {
        setAdding(t("Adding the picture…", "Rasm qo'shilmoqda…"));
        question = { ...question, img: await uploadImage(classId, it.parsed.image) };
      } catch (err) {
        setError(reasonOf(err));
      } finally {
        setAdding(null);
      }
    }
    setFixing({ index, question });
  }

  if (fixing) {
    return (
      <QuestionEditor
        classId={classId}
        initial={fixing.question}
        number={fixing.index + 1}
        onCancel={() => setFixing(null)}
        onDelete={() => { update(fixing.index, { skip: true }); setFixing(null); }}
        onSave={(q) => { update(fixing.index, { fixed: q, skip: false }); setFixing(null); }}
      />
    );
  }

  async function add() {
    haptic("medium");
    setError(null);
    const chosen = ready.slice(0, room);
    const pictures = chosen.filter((it) => !it.fixed && it.parsed.image).length;
    let done = 0;
    const out = [];
    try {
      for (const it of chosen) {
        if (it.fixed) { out.push(it.fixed); continue; }
        const q = fromParsed(it.parsed);
        if (it.parsed.image) {
          done += 1;
          setAdding(t(`Adding pictures ${done} of ${pictures}…`, `Rasmlar qo'shilmoqda: ${pictures} tadan ${done}…`));
          q.img = await uploadImage(classId, it.parsed.image);
        }
        out.push(q);
      }
      onAdd(out);
    } catch (err) {
      setError(t(`${reasonOf(err)} ${out.length} of ${chosen.length} were ready; try again to add the rest.`,
        `${reasonOf(err)} ${chosen.length} tadan ${out.length} tasi tayyor edi; qolganini qo'shish uchun qayta urinib ko'ring.`));
      setAdding(null);
    }
  }

  return (
    <div className="screen">
      <BackBar title={t("Questions found", "Topilgan savollar")} onBack={onCancel} />
      <div className="sub class-user">
        {preview.fileName} · {questionsText(items.length)}
        {broken.length ? t(` · ${broken.length} to fix`, ` · ${broken.length} tasini tuzatish kerak`) : ""}
        {preview.stray
          ? t(` · ${preview.stray} line${preview.stray === 1 ? "" : "s"} before the first question skipped`,
            ` · birinchi savoldan oldingi ${preview.stray} qator o'tkazib yuborildi`)
          : ""}
      </div>
      {broken.length > 0 && (
        <div className="class-note" style={{ marginTop: 0, marginBottom: 10 }}>
          {t("The ones in red couldn’t be read completely. Tap one to fix it — or leave it out.",
            "Qizil rangdagilarni to'liq o'qib bo'lmadi. Tuzatish uchun ustiga bosing — yoki tashlab keting.")}
        </div>
      )}

      <div className="pkg-list">
        {items.map((it, i) => {
          const q = it.fixed || it.parsed;
          return (
            <button key={i} className={`pkg-q${it.skip ? " skipped" : ""}`} onClick={() => openFix(i)}>
              <span className="pkg-n">{i + 1}</span>
              <span className="pkg-text">
                {q.q || t("Picture question", "Rasmli savol")}
                <small>
                  {q.type === "choice"
                    ? `${optionsText(q.options.length)}${q.answer >= 0 ? t(` · ${String.fromCharCode(65 + q.answer)} right`, ` · to'g'risi: ${String.fromCharCode(65 + q.answer)}`) : ""}`
                    : t(`Typed: ${q.answer || "—"}`, `Yozma: ${q.answer || "—"}`)}
                  {it.skip ? t(" · left out", " · qo'shilmaydi") : ""}
                </small>
                {!it.skip && !it.fixed && it.parsed.problem && <small className="pkg-problem">{it.parsed.problem}</small>}
                {it.fixed && <small className="pkg-fixed">{t("Fixed ✓", "Tuzatildi ✓")}</small>}
              </span>
              {urls[i] && !it.fixed && <img className="pkg-thumb" src={urls[i]} alt="" />}
            </button>
          );
        })}
      </div>

      <div className="home-cta">
        {error && <div className="game-warn">{error}</div>}
        {ready.length > room && <div className="cta-note">{t(`Only ${room} more fit in this package.`, `Bu to'plamga yana faqat ${room} ta savol sig'adi.`)}</div>}
        <button className="btn btn-primary" disabled={!ready.length || Boolean(adding)} onClick={add}>
          {adding || t(`Add ${questionsText(Math.min(ready.length, room))}`, `${questionsText(Math.min(ready.length, room))} qo'shish`)}
        </button>
      </div>
    </div>
  );
}

/** How to write a question file, with an example to copy. */
function FormatSheet({ onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Sheet title={t("How to write the file", "Faylni qanday yozish kerak")} onClose={onClose}>
      <div className="class-note" style={{ marginTop: 0 }}>
        {t("Number each question. Put its options under it, one per line — up to ten, A to J — then the answer. A question without options is typed; its answer is what the student must type. Pictures in Word files and web pages are taken with the question they sit under. No file? Type or paste the questions into a message to @usmleengo_bot, the same way — or forward it quizzes.",
          "Har bir savolni raqamlang. Variantlarini uning ostiga, har birini alohida qatorga yozing — o'ntagacha, A dan J gacha — keyin javobni. Varianti yo'q savol yozma bo'ladi: uning javobini talaba o'zi yozadi. Word fayllari va veb-sahifalardagi rasmlar ular ostida turgan savolga biriktiriladi. Fayl yo'qmi? Savollarni xuddi shunday @usmleengo_bot ga xabar qilib yozing yoki joylang — yoki unga viktorinalarni uzating.")}
      </div>
      <pre className="format-example">{formatExample()}</pre>
      <div className="class-note">
        {t("Also understood: “Q1:”, “1)”, “(a)”, “a.”, “Correct: B”, “Ans B”, a * after the right option, or the answer written out in full. Explanations and “Accept:” lines are optional.",
          "Shuningdek tushuniladi: «Savol 1:», «1)», «(a)», «a.», «To'g'ri javob: B», to'g'ri variantdan keyin * belgisi yoki javobning to'liq matni. «Izoh:» va «Qabul:» qatorlari ixtiyoriy. Inglizcha kalit so'zlar (Answer:, Explanation:) ham ishlaydi.")}
      </div>
      <button
        className="btn btn-ghost"
        style={{ marginTop: 12 }}
        onClick={async () => {
          try { await navigator.clipboard.writeText(formatExample()); setCopied(true); haptic("success"); } catch { /* not allowed here */ }
        }}
      >
        {copied ? t("Copied ✓", "Nusxalandi ✓") : t("Copy the example", "Namunani nusxalash")}
      </button>
    </Sheet>
  );
}

/* ── one question ────────────────────────────────────────────────────── */

export function QuestionEditor({ classId, initial, number, onSave, onCancel, onDelete }) {
  const [q, setQ] = useState(() => ({
    ...initial,
    options: initial.type === "choice" ? [...initial.options] : ["", ""],
    answer: initial.type === "choice" ? initial.answer : -1,
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
      <BackBar title={t(`Question ${number}`, `${number}-savol`)} onBack={onCancel} />

      <div className="period" role="tablist" aria-label={t("Answer type", "Javob turi")}>
        {[["choice", t("Options to tap", "Test")], ["typed", t("Typed answer", "Yozma javob")]].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={q.type === key} className={`period-opt${q.type === key ? " on" : ""}`}
            onClick={() => { haptic("light"); set({ type: key }); }}>
            {label}
          </button>
        ))}
      </div>

      <label className="game-field">
        <span className="section-label">{t("Question", "Savol")}</span>
        <textarea className="gap-input qe-text" rows={4} value={q.q} maxLength={2000}
          onChange={(e) => set({ q: e.target.value })}
          placeholder={q.type === "typed"
            ? t("Dementia, diarrhea and dermatitis = deficiency of vitamin ___", "Demensiya, diareya va dermatit = ___ vitamini yetishmovchiligi")
            : t("A 25-year-old woman has fatigue and pale conjunctivae. Most likely deficiency?",
              "25 yoshli ayolda holsizlik va konyunktivalar rangparligi. Eng ehtimoliy yetishmovchilik?")} />
      </label>

      <div className="qe-picture">
        {q.img ? (
          <>
            <img src={imageUrl(q.img)} alt="" />
            <button className="chips-clear" onClick={() => set({ img: undefined })}>{t("Remove picture", "Rasmni olib tashlash")}</button>
          </>
        ) : (
          <button className="btn btn-ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? t("Adding the picture…", "Rasm qo'shilmoqda…") : t("Add a picture", "Rasm qo'shish")}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPicture} />
      </div>

      {q.type === "choice" ? (
        <>
          <div className="section-label">{t("Options — tap the circle by the right one", "Variantlar — to'g'risi yonidagi doirachani bosing")}</div>
          <div className="qe-options">
            {q.options.map((o, i) => (
              <div key={i} className={`qe-option${q.answer === i ? " right" : ""}`}>
                <button className="qe-radio" aria-label={t(`Option ${i + 1} is right`, `${i + 1}-variant to'g'ri`)} aria-pressed={q.answer === i}
                  onClick={() => { haptic("light"); set({ answer: i }); }}>
                  {q.answer === i ? "✓" : ""}
                </button>
                <input className="gap-input" value={o} maxLength={400} placeholder={t(`Option ${String.fromCharCode(65 + i)}`, `${String.fromCharCode(65 + i)} variant`)}
                  onChange={(e) => set({ options: q.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                {q.options.length > 2 && (
                  <button className="qe-x" aria-label={t(`Remove option ${i + 1}`, `${i + 1}-variantni olib tashlash`)}
                    onClick={() => set({
                      options: q.options.filter((_, j) => j !== i),
                      answer: q.answer === i ? -1 : q.answer > i ? q.answer - 1 : q.answer,
                    })}>
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          {q.options.length < MAX_OPTIONS && (
            <button className="chips-clear qe-more" onClick={() => set({ options: [...q.options, ""] })}>{t("+ Add an option", "+ Variant qo'shish")}</button>
          )}
        </>
      ) : (
        <>
          <label className="game-field">
            <span className="section-label">{t("Answer", "Javob")}</span>
            <input className="gap-input" value={q.typed} maxLength={200} onChange={(e) => set({ typed: e.target.value })} placeholder="B3" />
          </label>
          <label className="game-field">
            <span className="section-label">{t("Also accept (optional, separated by commas)", "Boshqa to'g'ri javoblar (ixtiyoriy, vergul bilan)")}</span>
            <input className="gap-input" value={q.also} onChange={(e) => set({ also: e.target.value })} placeholder={t("niacin, vitamin b3", "niatsin, vitamin b3")} />
          </label>
          <div className="class-note" style={{ marginTop: -6 }}>
            {t("Small typos in longer answers are forgiven, as in the app’s own questions.",
              "Uzunroq javoblardagi kichik imlo xatolari kechiriladi, ilovaning o'z savollaridagi kabi.")}
          </div>
        </>
      )}

      <label className="game-field" style={{ marginTop: 12 }}>
        <span className="section-label">{t("Explanation (optional)", "Izoh (ixtiyoriy)")}</span>
        <textarea className="gap-input qe-text" rows={3} value={q.explain || ""} maxLength={2000}
          onChange={(e) => set({ explain: e.target.value })} placeholder={t("Shown after the answer.", "Javobdan keyin ko'rsatiladi.")} />
      </label>

      {onDelete && <DeleteButton label={t("Delete this question", "Savolni o'chirish")} confirm={t("Tap again to delete it", "O'chirish uchun yana bosing")} onConfirm={onDelete} />}

      <div className="home-cta">
        {problem && <div className="game-warn">{problem}</div>}
        <button className="btn btn-primary" disabled={uploading} onClick={done}>{t("Done", "Tayyor")}</button>
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
      <BackBar title={t("Add from usmleengo", "usmleengodan qo'shish")} onBack={onCancel} />
      <div className="search">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Search a topic — addison, niacin…", "Mavzu qidiring — Addison, niatsin…")} autoComplete="off" />
      </div>
      {!query.trim() && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {chips.map((c) => (
            <button key={c} className={`chip${tag === c ? " on" : ""}`} onClick={() => { haptic("light"); setTag(tag === c ? null : c); }}>
              {tagLabel(c)}
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
                {q.q || t("Picture question", "Rasmli savol")}
                <small>
                  {q.topic} · {q.type === "gap" ? t("typed", "yozma") : optionsText(q.options.length)}{q.img ? t(" · picture", " · rasm") : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="class-note">
          {query.trim() || tag ? t("Nothing new to add here.", "Bu yerda qo'shish uchun yangi savol yo'q.") : t("Search, or pick a category.", "Qidiring yoki fan tanlang.")}
        </div>
      )}
      <div className="home-cta">
        <button className="btn btn-primary" disabled={!picked.size} onClick={() => { haptic("medium"); onAdd([...picked.values()]); }}>
          {picked.size
            ? t(`Add ${questionsText(picked.size)}`, `${questionsText(picked.size)} qo'shish`)
            : t("Pick questions to add", "Qo'shish uchun savollarni tanlang")}
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
      <BackBar title={t("Set homework", "Uy vazifasi berish")} onBack={onBack} />
      <div className="section-label">{t("Package", "To'plam")}</div>
      <div className="opt-list">
        {packages.map((p) => (
          <button key={p.id} className={`opt-row${p.id === packageId ? " on" : ""}`} onClick={() => { haptic("light"); setPackageId(p.id); }}>
            <div>
              <div className="opt-name">{p.name}</div>
              <div className="opt-note">{questionsText(p.count)}</div>
            </div>
            <span className="tick">{p.id === packageId ? "✓" : ""}</span>
          </button>
        ))}
      </div>
      <label className="game-field" style={{ marginTop: 14 }}>
        <span className="section-label">{t("Title (optional)", "Nomi (ixtiyoriy)")}</span>
        <input className="gap-input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder={chosen?.name || ""} />
      </label>
      <label className="game-field">
        <span className="section-label">{t("Due by the end of", "Topshirish muddati (shu kun oxirigacha)")}</span>
        <input className="gap-input" type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
      </label>
      <div className="class-note">
        {t("Each student’s first try is the one that counts. Try-agains after that are practice.",
          "Har bir talabaning faqat birinchi urinishi hisoblanadi. Keyingi urinishlar — mashq.")}
      </div>
      <div className="home-cta">
        {error && <div className="game-warn">{error}</div>}
        <button className="btn btn-primary" disabled={busy || !packageId || !date} onClick={assign}>
          {busy ? t("Setting it…", "Berilmoqda…") : t("Set homework", "Uy vazifasi berish")}
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
        <BackBar title={t("Homework", "Uy vazifasi")} onBack={onBack} />
        <div className="empty">{error || t("Loading…", "Yuklanmoqda…")}</div>
      </div>
    );
  }

  const done = data.students.filter((s) => s.done);
  const band = (pct) => (pct < 60 ? " low" : pct < 80 ? " mid" : "");
  return (
    <div className="screen rating">
      <BackBar title={data.assignment.title} onBack={onBack} />
      <div className="sub class-user">
        {t(`${data.assignment.packageName} · due ${dayText(data.assignment.dueAt)} · ${done.length} of ${data.students.length} handed in`,
          `${data.assignment.packageName} · muddati: ${dayText(data.assignment.dueAt)} · ${data.students.length} tadan ${done.length} tasi topshirdi`)}
      </div>

      <div className="section-label">{t("Students", "Talabalar")}</div>
      <div className="board">
        {data.students.map((s) => (
          <div key={s.player} className="board-row">
            <span className="board-who">
              <span className="board-name">{s.name}</span>
              <span className="board-user">
                {s.done
                  ? t(`Handed in ${dayText(s.finishedAt)}${s.late ? " · late" : ""}`, `Topshirdi: ${dayText(s.finishedAt)}${s.late ? " · kechikib" : ""}`)
                  : t("Not yet", "Hali yo'q")}
              </span>
            </span>
            <span className="board-value">{s.done ? `${s.score}/${s.total}` : "—"}</span>
          </div>
        ))}
        {!data.students.length && <div className="board-empty">{t("No students in the class yet.", "Guruhda hali talabalar yo'q.")}</div>}
      </div>

      <div className="section-label">{t("Each question", "Har bir savol")}</div>
      <div className="weak-list">
        {data.questions.map((q) => (
          <div key={q.id} className="weak-row">
            <span className="weak-name">
              {t(`Q${q.n}`, `${q.n}-savol`)}
              <small>{t(`${q.answered} answered`, `${q.answered} ta javob`)}</small>
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
      <DeleteButton label={t("Delete this homework", "Uy vazifasini o'chirish")}
        confirm={t("Tap again: delete it and its scores", "Yana bosing: vazifa va uning natijalari o'chiriladi")} onConfirm={remove} />
    </div>
  );
}

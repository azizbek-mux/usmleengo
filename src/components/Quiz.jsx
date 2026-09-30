import React, { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n.js";
import { grade } from "../lib/session.js";
import { reportQuestion } from "../lib/report.js";
import { haptic } from "../lib/telegram.js";
import { Bookmark, Flask } from "./Icons.jsx";
import LabValues from "./LabValues.jsx";

/** Renders "… vitamin ___" with the blank styled rather than literal underscores. */
function GapText({ text }) {
  const parts = text.split("___");
  return (
    <>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {p}
          {i < parts.length - 1 && <span className="gap">&nbsp;&nbsp;?&nbsp;&nbsp;</span>}
        </React.Fragment>
      ))}
    </>
  );
}

export default function Quiz({ questions, label, saved = [], onSave, onAnswer, onDone, onQuit }) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState(null); // null | { correct, chosen }
  const [combo, setCombo] = useState(0);
  // Histology detail does not survive a phone-sized card, so the picture opens
  // full screen on a tap.
  const [zoom, setZoom] = useState(false);
  // The NBME lab values, in a sheet over the question.
  const [labs, setLabs] = useState(false);
  const inputRef = useRef(null);
  // When the current question appeared. Feeds XP and the rating: an answer is
  // worth less the longer it took, and the clock runs whether or not the app
  // stayed on screen, because leaving to look something up is exactly what it
  // is there to notice. It stops at the answer, so reading the explanation
  // afterwards costs nothing. See rating.js.
  const shownAt = useRef(0);

  const q = questions[idx];
  const isLast = idx === questions.length - 1;

  // Moving on closes the viewer — otherwise the next question opens behind an
  // enlarged picture of the last one.
  useEffect(() => { setZoom(false); }, [idx]);

  // Start the clock for each question.
  useEffect(() => {
    shownAt.current = performance.now();
  }, [idx]);

  // Focus the text field for gap questions, but never while feedback is up —
  // the keyboard would cover the explanation.
  useEffect(() => {
    if (q?.type === "gap" && !verdict) {
      const timer = setTimeout(() => inputRef.current?.focus(), 240);
      return () => clearTimeout(timer);
    }
  }, [idx, q, verdict]);

  if (!q) return null;

  // The bank's pictures ship with the app; a class's are served by the server.
  const imgSrc = q.img
    ? (/^(https?:)?\/\//.test(q.img) || q.img.startsWith("/") ? q.img : `${import.meta.env.BASE_URL}img/${q.img}`)
    : null;

  function settle(correct, chosen) {
    const elapsed = performance.now() - shownAt.current;
    setVerdict({ correct, chosen });
    setCombo((c) => (correct ? c + 1 : 0));
    haptic(correct ? "success" : "error");
    onAnswer(q, correct, elapsed, chosen);
  }

  function answerBinary(i) {
    if (verdict) return;
    settle(i === q.answer, i);
  }

  function answerGap(e) {
    e?.preventDefault();
    if (verdict || !typed.trim()) return;
    inputRef.current?.blur();
    settle(grade(q, typed), typed);
  }

  function next() {
    haptic("light");
    if (isLast) return onDone();
    setIdx((i) => i + 1);
    setTyped("");
    setVerdict(null);
  }

  const progress = ((idx + (verdict ? 1 : 0)) / questions.length) * 100;

  return (
    <div className="screen">
      <div className="quiz-top">
        <button className="close" onClick={onQuit} aria-label={t("Quit", "Chiqish")}>×</button>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="combo">{combo >= 2 ? `🔥${combo}` : ""}</div>
        <button
          className="save-btn"
          onClick={() => { haptic("light"); setLabs(true); }}
          aria-label={t("NBME lab values", "NBME laboratoriya me'yorlari")}
        >
          <Flask />
        </button>
        {/* Save for later: the question lands in Saved on the Quiz tab.
            Not offered in a class round, whose questions are the teacher's. */}
        {onSave && (
          <button
            className={`save-btn${saved.includes(q.id) ? " on" : ""}`}
            onClick={() => { haptic("light"); onSave(q.id); }}
            aria-pressed={saved.includes(q.id)}
            aria-label={saved.includes(q.id) ? t("Remove from saved", "Saqlanganlardan olib tashlash") : t("Save this question", "Savolni saqlash")}
          >
            <Bookmark filled={saved.includes(q.id)} />
          </button>
        )}
      </div>

      {/* Suppressed where the topic would hand over the answer — see
          topicLeaks() in tools/compile.mjs. */}
      {q.hideTopic ? <div className="q-topic-gap" /> : <div className="q-topic">{q.topic}</div>}

      {/* An image question from the bank has no stem at all: the picture is
          the question. A teacher's question may have both. */}
      {q.img && (
        <button className="q-img" onClick={() => { haptic("light"); setZoom(true); }}
                aria-label={t("Enlarge picture", "Rasmni kattalashtirish")}>
          <img
            src={imgSrc}
            alt=""
            onError={(e) => { e.currentTarget.closest(".q-img").classList.add("broken"); }}
          />
          <span className="q-img-hint">{t("tap to enlarge", "kattalashtirish uchun bosing")}</span>
        </button>
      )}
      {(!q.img || q.q) && (
        <div className="q-text">
          {q.type === "gap" ? <GapText text={q.q} /> : q.q}
        </div>
      )}

      {q.type === "binary" ? (
        <div className="options">
          {q.options.map((opt, i) => {
            let cls = "opt";
            if (verdict) {
              if (i === q.answer) cls += " correct";
              else if (i === verdict.chosen) cls += " wrong";
              else cls += " faded";
            }
            return (
              <button key={i} className={cls} onClick={() => answerBinary(i)} disabled={Boolean(verdict)}>
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <form onSubmit={answerGap}>
          <input
            ref={inputRef}
            className={`gap-input${verdict ? (verdict.correct ? " correct" : " wrong") : ""}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("Type your answer…", "Javobingizni yozing…")}
            disabled={Boolean(verdict)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            enterKeyHint="done"
          />
        </form>
      )}

      <div className="quiz-foot">
        {verdict && (
          <div className={`feedback ${verdict.correct ? "ok" : "no"}`}>
            <div className="fb-head">
              {verdict.correct ? t("✓ Correct", "✓ To'g'ri") : t("✗ Not quite", "✗ Noto'g'ri")}
            </div>
            <div className="fb-body">
              {!verdict.correct && (
                <>
                  {t("Answer:", "Javob:")} <b>{q.type === "gap" ? q.answer : q.options[q.answer]}</b>
                  {" — "}
                </>
              )}
              {q.explain}
            </div>
            {/* Only the bank's own questions: a teacher's are theirs to fix. */}
            {onSave && (
              <button className="fb-report" onClick={() => reportQuestion(q)}>
                {t("Something wrong with this question? Tell me", "Savolda xato bormi? Menga yozing")}
              </button>
            )}
          </div>
        )}

        {verdict ? (
          <button className="btn btn-primary" onClick={next}>
            {isLast ? t("See results", "Natijalarni ko'rish") : t("Continue", "Davom etish")}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={answerGap}
            disabled={q.type === "binary" || !typed.trim()}
            style={q.type === "binary" ? { visibility: "hidden" } : undefined}
          >
            {t("Check", "Tekshirish")}
          </button>
        )}
      </div>

      {labs && <LabValues onClose={() => setLabs(false)} />}

      {zoom && q.img && (
        <div className="zoom" onClick={() => setZoom(false)} role="dialog" aria-label={t("Picture", "Rasm")}>
          <img src={imgSrc} alt="" />
          <button className="zoom-x" aria-label={t("Close", "Yopish")}>×</button>
        </div>
      )}
    </div>
  );
}

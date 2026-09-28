import React, { useEffect, useRef, useState } from "react";
import { grade } from "../lib/session.js";
import { haptic } from "../lib/telegram.js";
import { Bookmark } from "./Icons.jsx";

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
  const inputRef = useRef(null);
  // When the current question appeared, and whether the app left the screen
  // while it was up. Feeds the speed rating; see record() in storage.js.
  const shownAt = useRef(0);
  const leftScreen = useRef(false);

  const q = questions[idx];
  const isLast = idx === questions.length - 1;

  // Moving on closes the viewer — otherwise the next question opens behind an
  // enlarged picture of the last one.
  useEffect(() => { setZoom(false); }, [idx]);

  // Start the clock for each question.
  useEffect(() => {
    shownAt.current = performance.now();
    leftScreen.current = document.hidden;
  }, [idx]);

  // A phone call or a switch to another app mid-question is not thinking
  // time. Rather than guess how much of the gap was away, that one answer is
  // simply not timed.
  useEffect(() => {
    const onHide = () => { if (document.hidden) leftScreen.current = true; };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // Focus the text field for gap questions, but never while feedback is up —
  // the keyboard would cover the explanation.
  useEffect(() => {
    if (q?.type === "gap" && !verdict) {
      const t = setTimeout(() => inputRef.current?.focus(), 240);
      return () => clearTimeout(t);
    }
  }, [idx, q, verdict]);

  if (!q) return null;

  // The bank's pictures ship with the app; a class's are served by the server.
  const imgSrc = q.img
    ? (/^(https?:)?\/\//.test(q.img) || q.img.startsWith("/") ? q.img : `${import.meta.env.BASE_URL}img/${q.img}`)
    : null;

  function settle(correct, chosen) {
    const elapsed = leftScreen.current ? null : performance.now() - shownAt.current;
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
        <button className="close" onClick={onQuit} aria-label="Quit">×</button>
        <div className="bar">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="combo">{combo >= 2 ? `🔥${combo}` : ""}</div>
        {/* Save for later: the question lands in Saved on the Quiz tab.
            Not offered in a class round, whose questions are the teacher's. */}
        {onSave && (
          <button
            className={`save-btn${saved.includes(q.id) ? " on" : ""}`}
            onClick={() => { haptic("light"); onSave(q.id); }}
            aria-pressed={saved.includes(q.id)}
            aria-label={saved.includes(q.id) ? "Remove from saved" : "Save this question"}
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
                aria-label="Enlarge picture">
          <img
            src={imgSrc}
            alt=""
            onError={(e) => { e.currentTarget.closest(".q-img").classList.add("broken"); }}
          />
          <span className="q-img-hint">tap to enlarge</span>
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
            placeholder="Type your answer…"
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
              {verdict.correct ? "✓ Correct" : "✗ Not quite"}
            </div>
            <div className="fb-body">
              {!verdict.correct && (
                <>
                  Answer: <b>{q.type === "gap" ? q.answer : q.options[q.answer]}</b>
                  {" — "}
                </>
              )}
              {q.explain}
            </div>
          </div>
        )}

        {verdict ? (
          <button className="btn btn-primary" onClick={next}>
            {isLast ? "See results" : "Continue"}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={answerGap}
            disabled={q.type === "binary" || !typed.trim()}
            style={q.type === "binary" ? { visibility: "hidden" } : undefined}
          >
            Check
          </button>
        )}
      </div>

      {zoom && q.img && (
        <div className="zoom" onClick={() => setZoom(false)} role="dialog" aria-label="Picture">
          <img src={imgSrc} alt="" />
          <button className="zoom-x" aria-label="Close">×</button>
        </div>
      )}
    </div>
  );
}

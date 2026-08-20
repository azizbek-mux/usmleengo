import React, { useEffect, useState } from "react";
import { share } from "../lib/telegram.js";

const R = 74;
const CIRC = 2 * Math.PI * R;

function Ring({ pct }) {
  // Start at zero so the ring animates on mount rather than snapping.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div className="ring-wrap">
      <svg width="168" height="168">
        <circle className="ring-bg" cx="84" cy="84" r={R} fill="none" strokeWidth="13" />
        <circle
          className="ring-fg"
          cx="84" cy="84" r={R} fill="none" strokeWidth="13"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC - (shown / 100) * CIRC}
        />
      </svg>
      <div className="ring-mid">
        <div className="ring-pct">{pct}%</div>
        <div className="ring-sub">accuracy</div>
      </div>
    </div>
  );
}

function title(pct) {
  if (pct === 100) return "Perfect round";
  if (pct >= 80) return "Strong work";
  if (pct >= 50) return "Solid effort";
  return "Worth another pass";
}

export default function Result({ log, label, xpEarned, streak, streakAdvanced, onAgain, onHome }) {
  const correct = log.filter((l) => l.correct).length;
  const wrong = log.length - correct;
  const pct = log.length ? Math.round((correct / log.length) * 100) : 0;
  const missed = log.filter((l) => !l.correct);

  return (
    <div className="screen result-screen">
      <Ring pct={pct} />

      <div className="result-title">{title(pct)}</div>
      <div className="result-sub">
        {correct} of {log.length} correct{label ? ` · ${label}` : ""}
      </div>

      {streakAdvanced && (
        <div className="streak-pop">
          <div className="n">🔥 {streak} day{streak > 1 ? "s" : ""}</div>
          <div className="l">Streak extended — come back tomorrow</div>
        </div>
      )}

      {/* Correct vs incorrect, as a proportional bar plus explicit numbers. */}
      <div className="split">
        <div className="split-bar">
          <div className="split-ok" style={{ width: `${pct}%` }} />
          <div className="split-no" style={{ width: `${100 - pct}%` }} />
        </div>
        <div className="split-legend">
          <div className="leg">
            <span className="dot ok" />
            <b>{correct}</b> correct
            <span className="leg-pct">{pct}%</span>
          </div>
          <div className="leg">
            <span className="dot no" />
            <b>{wrong}</b> incorrect
            <span className="leg-pct">{100 - pct}%</span>
          </div>
        </div>
      </div>

      <div className="reward-row">
        <div className="reward mint">
          <div className="reward-v">+{xpEarned}</div>
          <div className="reward-l">XP</div>
        </div>
        <div className="reward">
          <div className="reward-v">{correct}/{log.length}</div>
          <div className="reward-l">Score</div>
        </div>
        <div className="reward gold">
          <div className="reward-v">{streak}</div>
          <div className="reward-l">Streak</div>
        </div>
      </div>

      {missed.length > 0 && (
        <div className="review">
          <div className="section-label">Review</div>
          {missed.slice(0, 5).map((l, i) => (
            <div className="review-item" key={i}>
              <span className="review-mark no">✗</span>
              <span className="review-q">
                {l.question.topic} — <b>{l.question.type === "gap" ? l.question.answer : l.question.options[l.question.answer]}</b>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="result-actions">
        <button className="btn btn-primary" onClick={onAgain}>Another round</button>
        <button
          className="btn btn-ghost"
          onClick={() =>
            share(
              `I scored ${correct}/${log.length} on usmleengo` +
              (streak > 1 ? ` — ${streak} day streak 🔥` : "") +
              `\n\n5000+ USMLE micro-quizzes, free:`
            )
          }
        >
          Share score
        </button>
        <button className="btn btn-ghost" onClick={onHome}>Done for now</button>
      </div>
    </div>
  );
}

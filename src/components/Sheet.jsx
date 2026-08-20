import React, { useEffect } from "react";
import bank from "../data/bank.js";
import { haptic } from "../lib/telegram.js";

/** Bottom sheet. Closes on backdrop tap or Escape. */
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <span className="sheet-title">{title}</span>
          <button className="sheet-x" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const TYPES = [
  { id: "random", name: "Mix of both", note: "Tapping and typing together" },
  { id: "binary", name: "Multiple choice only", note: "Two options, one tap" },
  { id: "gap", name: "Fill the gap only", note: "Type the answer yourself" },
];

export function SettingsSheet({ state, onQType, onReset, onClose }) {
  const counts = {
    binary: bank.filter((q) => q.type === "binary").length,
    gap: bank.filter((q) => q.type === "gap").length,
    random: bank.length,
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="section-label" style={{ marginTop: 4 }}>Question type</div>
      <div className="opt-list">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={`opt-row${state.qtype === t.id ? " on" : ""}`}
            onClick={() => { haptic("light"); onQType(t.id); }}
          >
            <div>
              <div className="opt-name">{t.name}</div>
              <div className="opt-note">{t.note} · {counts[t.id].toLocaleString()} questions</div>
            </div>
            <span className="tick">{state.qtype === t.id ? "✓" : ""}</span>
          </button>
        ))}
      </div>

      <div className="section-label">Your progress</div>
      <div className="stat-grid">
        <div className="mini"><b>{state.answered}</b><span>answered</span></div>
        <div className="mini"><b>{state.answered ? Math.round((state.correct / state.answered) * 100) : 0}%</b><span>correct</span></div>
        <div className="mini"><b>{state.best}</b><span>best streak</span></div>
      </div>

      <button className="btn btn-danger" onClick={onReset}>Reset all progress</button>
      <div className="cta-note">Clears XP, streak and question history. Cannot be undone.</div>

      <div className="byline">designed by mukhtorov</div>
    </Sheet>
  );
}

export function XpSheet({ state, onClose }) {
  const accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;

  return (
    <Sheet title="What is XP?" onClose={onClose}>
      <p className="prose">
        XP stands for <b>experience points</b>. It is a running total of the practice
        you have done — not a grade, and not a score anyone else sees.
      </p>

      <div className="xp-rules">
        <div className="xp-rule">
          <span className="xp-amt ok">+10</span>
          <span>for every question you answer correctly</span>
        </div>
        <div className="xp-rule">
          <span className="xp-amt">+2</span>
          <span>for every question you get wrong</span>
        </div>
      </div>

      <p className="prose">
        You still earn XP for wrong answers on purpose. Getting something wrong and
        reading why is how the practice works — the app should not punish you for
        attempting the harder questions.
      </p>
      <p className="prose">
        Because it only ever goes up, XP measures <b>effort over time</b>. If you want to
        know how well you are actually doing, look at your accuracy instead.
      </p>

      <div className="stat-grid">
        <div className="mini"><b>{state.xp.toLocaleString()}</b><span>total XP</span></div>
        <div className="mini"><b>{accuracy}%</b><span>accuracy</span></div>
        <div className="mini"><b>{state.streak}</b><span>day streak</span></div>
      </div>

      <button className="btn btn-primary" onClick={onClose}>Got it</button>
    </Sheet>
  );
}

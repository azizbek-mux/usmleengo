import React from "react";
import Logo from "./Logo.jsx";
import { bankBlurb } from "../data/bank.js";
import { QTYPES } from "../lib/qtypes.js";
import { haptic } from "../lib/telegram.js";

/**
 * First run only. Asked once, stored, and changeable later from Settings —
 * so this screen never appears again unless the user resets.
 *
 * Deliberately unexplained: the three modes are self-evident from their names,
 * and this is the screen standing between someone and their first question.
 * The same rows appear in Settings, so nothing here is a one-time decision.
 */
export default function Onboarding({ onChoose }) {
  const choose = (qtype) => {
    haptic("medium");
    onChoose(qtype);
  };

  return (
    <div className="screen onboard">
      <div className="onboard-top">
        <Logo size={104} className="onboard-mark" />
        <p className="onboard-sub">{bankBlurb()}</p>
      </div>

      <div className="section-label">Question type</div>
      <div className="opt-list">
        {QTYPES.map((t) => (
          <button key={t.id} className="opt-row" onClick={() => choose(t.id)}>
            <div>
              <div className="opt-name">{t.name}</div>
              <div className="opt-note">{t.note}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

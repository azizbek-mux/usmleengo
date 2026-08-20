import React from "react";
import bank from "../data/bank.js";
import { haptic } from "../lib/telegram.js";

/**
 * First run only. Asked once, stored, and changeable later from Settings —
 * so this screen never appears again unless the user resets.
 */
export default function Onboarding({ onChoose }) {
  const binary = bank.filter((q) => q.type === "binary").length;
  const gap = bank.length - binary;

  const choose = (qtype) => {
    haptic("medium");
    onChoose(qtype);
  };

  return (
    <div className="screen onboard">
      <div className="onboard-top">
        <div className="onboard-mark">💊</div>
        <h1 className="onboard-title">USMLE Drops</h1>
        <p className="onboard-sub">
          {bank.length.toLocaleString()} questions. Pick how you want to practise —
          you can change this any time.
        </p>
      </div>

      <div className="choices">
        <button className="choice" onClick={() => choose("random")}>
          <div className="choice-head">
            <span className="choice-name">Mix of both</span>
            <span className="badge">Recommended</span>
          </div>
          <div className="choice-desc">
            Alternates tapping and typing. Recognition and recall together —
            the combination that sticks best.
          </div>
          <div className="choice-meta">all {bank.length.toLocaleString()} questions</div>
        </button>

        <button className="choice" onClick={() => choose("binary")}>
          <div className="choice-head">
            <span className="choice-name">Multiple choice only</span>
          </div>
          <div className="choice-desc">
            Two options, one tap. The fastest way to run a session — good for
            queues and short breaks.
          </div>
          <div className="choice-meta">{binary.toLocaleString()} questions</div>
        </button>

        <button className="choice" onClick={() => choose("gap")}>
          <div className="choice-head">
            <span className="choice-name">Fill the gap only</span>
          </div>
          <div className="choice-desc">
            Type the answer yourself. Harder than recognising it, and it exposes
            what you only half-know.
          </div>
          <div className="choice-meta">{gap.toLocaleString()} questions</div>
        </button>
      </div>
    </div>
  );
}

import React, { useEffect, useRef, useState } from "react";
import { hasBackButton, haptic, showBack } from "../lib/telegram.js";
import { Book, Checklist, Players, School, Trophy, User } from "./Icons.jsx";

// The frame every screen shares.
//
//   - The six sections are tabs along the bottom, always one tap away.
//   - A section's own screen opens with a big title on the left and at most
//     one small thing on the right (ScreenHead), and its main action is
//     pinned just above the tab bar, reachable without scrolling.
//   - A screen opened from inside a section (a game's setup, say) has a back
//     arrow instead: Telegram's own, in its top bar, or on the web one drawn
//     here (BackBar).
//   - Anything that needs full attention — a quiz, a flashcard session, a
//     live game — hides the tab bar.

export const TABS = [
  { id: "quiz", label: "Quiz", Icon: Checklist },
  { id: "english", label: "English", Icon: Book },
  { id: "play", label: "Play", Icon: Players },
  { id: "class", label: "Class", Icon: School },
  { id: "rating", label: "Rating", Icon: Trophy },
  { id: "me", label: "Me", Icon: User },
];

export function TabBar({ tab, onTab }) {
  // A phone keyboard pushes a fixed bar up into the middle of the screen, so
  // the bar steps aside while anything is being typed.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const isField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    const onIn = (e) => { if (isField(e.target)) setTyping(true); };
    const onOut = (e) => { if (isField(e.target)) setTyping(false); };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  return (
    <nav className={`tabbar${typing ? " typing" : ""}`} aria-label="Sections">
      <div className="tabbar-in">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`tab-btn${tab === id ? " on" : ""}`}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => { if (tab !== id) { haptic("light"); onTab(id); } }}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** A section's heading: the title, a line under it, and one thing on the right. */
export function ScreenHead({ title, sub, right }) {
  return (
    <div className="home-head">
      <div className="head-text">
        <h1 className="page-title">{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

/** The day streak, small, for the right of a heading. */
export function StreakPill({ days }) {
  return (
    <span className="streak-pill" aria-label={`${days}-day streak`}>
      🔥 <b>{days}</b>
    </span>
  );
}

/**
 * The top of a screen opened from inside a section. Inside Telegram the
 * back arrow is Telegram's own and only the title is drawn here.
 */
export function BackBar({ title, onBack }) {
  // Registered once; the ref keeps the handler current across redraws, so
  // Telegram's arrow does not blink on every render.
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => showBack(() => { haptic("light"); latest.current(); }), []);
  return (
    <div className="rating-top">
      {hasBackButton ? (
        <span className="rating-spacer" />
      ) : (
        <button className="back-link" onClick={() => { haptic("light"); onBack(); }}>‹ Back</button>
      )}
      <span className="rating-title">{title}</span>
      <span className="rating-spacer" />
    </div>
  );
}

import React from "react";
import Logo from "./Logo.jsx";
import { bankBlurb } from "../data/bank.js";
import { GLOSSARY_COUNT } from "../data/glossary-version.js";
import { haptic } from "../lib/telegram.js";

/**
 * First run only: which half of the app did they come for?
 *
 * It used to open on the question-type question, which is meaningless to
 * someone who came for the flashcards — and it made the quiz look like the
 * whole app. The answer is remembered, so the app reopens wherever they were
 * last, and both halves stay one tap apart after that.
 *
 * The counts come from the generated version files rather than the fetched
 * payloads, so this screen is honest about the deck size without waiting on a
 * 500 KB download to say it.
 */

const Book = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const Checklist = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 5h10M9 12h10M9 19h10" />
    <path d="m3 5 1.5 1.5L7 4" />
    <path d="m3 12 1.5 1.5L7 11" />
    <circle cx="4.5" cy="19" r="1.4" />
  </svg>
);

const Arrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const SECTIONS = [
  {
    id: "english",
    icon: <Book />,
    name: "Medical English",
    note: () => `${GLOSSARY_COUNT.toLocaleString()} clinical terms · Anki flashcards`,
  },
  {
    id: "quiz",
    icon: <Checklist />,
    name: "USMLE quizzes",
    note: () => `${bankBlurb()} · tap or type the answer`,
  },
];

export default function SectionPick({ onChoose }) {
  const choose = (id) => {
    haptic("medium");
    onChoose(id);
  };

  return (
    <div className="screen onboard">
      <div className="onboard-top">
        <Logo size={104} className="onboard-mark" />
        <p className="onboard-sub">I want to do…</p>
      </div>

      <div className="pick-list">
        {SECTIONS.map((s) => (
          <button key={s.id} className="pick" onClick={() => choose(s.id)}>
            <span className="pick-ico">{s.icon}</span>
            <span className="pick-body">
              <span className="pick-name">{s.name}</span>
              <span className="pick-note">{s.note()}</span>
            </span>
            <span className="pick-go"><Arrow /></span>
          </button>
        ))}
      </div>

      <div className="cta-note">Both are always one tap apart.</div>
    </div>
  );
}

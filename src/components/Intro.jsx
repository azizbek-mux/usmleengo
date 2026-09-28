import React, { useEffect, useRef, useState } from "react";
import { haptic, showBack } from "../lib/telegram.js";
import { Book, Checklist, Players, School, Trophy, User } from "./Icons.jsx";

/**
 * How to use the app, one card per tab, in the order of the tab bar. Shown
 * once to someone who has never studied here, and again from Me.
 */
export const INTRO_CARDS = [
  {
    Icon: Checklist,
    eyebrow: "Welcome to usmleengo",
    title: "Quiz",
    text: "6,300+ five-second USMLE questions. Pick subjects, or tap Random for a mixed round. Your mistakes and saved questions wait in Review.",
  },
  {
    Icon: Book,
    title: "English",
    text: "8,000+ clinical terms with Uzbek translations. A few minutes a day — each word comes back just before you'd forget it.",
  },
  {
    Icon: Players,
    title: "Play",
    text: "Live quiz games with up to 50 friends. Create a game, share the code, and the fastest right answers win.",
  },
  {
    Icon: School,
    title: "Class",
    text: "Teachers make a class, invite students with a link, set homework and follow everyone's progress. Students join with a code.",
  },
  {
    Icon: Trophy,
    title: "Rating",
    text: "Every player is ranked by points: your day streak counts most, then XP, then speed. Top 10 all time and this week.",
  },
  {
    Icon: User,
    title: "Me",
    text: "Your points, streak and stats, settings, and help. Study a little every day to keep your streak alive.",
  },
];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Swipe cards, or Next. The row is a native scroll-snap strip, so a swipe
 * feels like the phone's own; the dots follow whichever card is centred.
 */
export default function Intro({ onDone }) {
  const [index, setIndex] = useState(0);
  const strip = useRef(null);
  const settle = useRef(null);
  const last = index === INTRO_CARDS.length - 1;

  useEffect(() => showBack(onDone), [onDone]);
  useEffect(() => () => clearTimeout(settle.current), []);

  // Next moves to its card at once — the dots and the button don't wait for
  // the slide, so quick taps each count.
  const go = (i) => {
    const el = strip.current;
    if (!el) return;
    const to = Math.max(0, Math.min(INTRO_CARDS.length - 1, i));
    const left = to * el.clientWidth;
    setIndex(to);
    if (reducedMotion()) { el.scrollTo({ left }); return; }
    el.scrollTo({ left, behavior: "smooth" });
    // A phone saving battery can stall the slide; the card still has to arrive.
    setTimeout(() => { if (Math.abs(el.scrollLeft - left) > 2) el.scrollTo({ left }); }, 700);
  };

  // A swipe is read once the strip comes to rest, not on every frame of it.
  const onScroll = (e) => {
    const el = e.currentTarget;
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))), 120);
  };

  // A light tick for each new card, however it was reached.
  const shown = useRef(index);
  useEffect(() => {
    if (shown.current !== index) haptic("light");
    shown.current = index;
  }, [index]);

  return (
    <div className="intro" role="dialog" aria-label="How to use usmleengo">
      <button className="intro-skip" onClick={() => { haptic("light"); onDone(); }}>
        {last ? "Close" : "Skip"}
      </button>

      <div
        className="intro-strip"
        ref={strip}
        onScroll={onScroll}
      >
        {INTRO_CARDS.map(({ Icon, eyebrow, title, text }, i) => (
          <section key={title} className="intro-card" aria-hidden={i !== index}>
            <span className="intro-icon"><Icon size={40} /></span>
            {eyebrow && <span className="intro-eyebrow">{eyebrow}</span>}
            <h2 className="intro-title">{title}</h2>
            <p className="intro-text">{text}</p>
          </section>
        ))}
      </div>

      <div className="intro-foot">
        <div className="intro-dots" aria-hidden="true">
          {INTRO_CARDS.map((c, i) => (
            <button key={c.title} className={`intro-dot${i === index ? " on" : ""}`} tabIndex={-1} onClick={() => go(i)} />
          ))}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (last) { haptic("success"); onDone(); } else go(index + 1);
          }}
        >
          {last ? "Start studying" : "Next"}
        </button>
      </div>
    </div>
  );
}

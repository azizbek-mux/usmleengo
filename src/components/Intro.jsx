import React, { useEffect, useRef, useState } from "react";
import { bankPlus } from "../data/bank.js";
import { t } from "../lib/i18n.js";
import { haptic, showBack } from "../lib/telegram.js";
import { Book, Checklist, Players, School, Trophy, User } from "./Icons.jsx";
import Logo from "./Logo.jsx";

/**
 * How to use the app, one card per tab, in the order of the tab bar. Shown
 * once to someone who has never studied here, and again from Me. Built on
 * each render, so choosing a language on the first card redraws the rest.
 */
export const introCards = () => [
  {
    id: "quiz",
    Icon: Checklist,
    eyebrow: t("Welcome to usmleengo", "usmleengoga xush kelibsiz"),
    title: t("Quiz", "Testlar"),
    text: t(
      `${bankPlus() || "Thousands of"} five-second USMLE questions. Tap Random for a mixed round, or pick systems and subjects first. Your mistakes and saved questions wait in Review. The flask beside the search opens normal lab values.`,
      `${bankPlus() ? `${bankPlus()} ta` : "Minglab"} besh soniyalik USMLE savoli. Aralash savollar uchun «Tasodifiy»ni bosing yoki avval tizim va fanlarni tanlang. Xatolaringiz va saqlangan savollaringiz «Takrorlash» bo'limida turadi. Qidiruv yonidagi kolba normal laboratoriya ko'rsatkichlarini ochadi.`,
    ),
  },
  {
    id: "english",
    Icon: Book,
    title: t("English", "Ingliz tili"),
    text: t(
      "8,000+ clinical terms with Uzbek translations. A few minutes a day — each word comes back just before you'd forget it.",
      "8 000+ ta klinik atama o'zbekcha tarjimasi bilan. Kuniga bir necha daqiqa — har bir so'z siz uni unutishingizdan sal oldin yana ko'rsatiladi.",
    ),
  },
  {
    id: "play",
    Icon: Players,
    title: t("Play", "O'yin"),
    text: t(
      "Live quiz games with up to 50 friends. Create a game, share the code, and the fastest right answers win.",
      "Do'stlaringiz bilan jonli test o'yini — 50 kishigacha. O'yin yarating, kodini ulashing: eng tez to'g'ri javob bergan g'olib bo'ladi.",
    ),
  },
  {
    id: "class",
    Icon: School,
    title: t("Class", "Guruh"),
    text: t(
      "Teachers make a class, invite students with a link, set homework and follow everyone's progress. Students join with a code.",
      "O'qituvchi guruh ochadi, talabalarni havola orqali taklif qiladi, uy vazifasi beradi va har birining natijasini kuzatadi. Talabalar guruhga kod orqali qo'shiladi.",
    ),
  },
  {
    id: "rating",
    Icon: Trophy,
    title: t("Rating", "Reyting"),
    text: t(
      "Every player is ranked by points: your day streak counts most, then XP, then speed. Top 10 all time and this week.",
      "Har bir o'yinchi ball bo'yicha saralanadi: eng katta ulushi kunlik intizomda, keyin XP va tezlikda. Barcha vaqtlar va shu haftaning eng yaxshi 10 talik ro'yxati.",
    ),
  },
  {
    id: "me",
    Icon: User,
    title: t("Me", "Profil"),
    text: t(
      "Your points, streak and stats, settings, and help. Study a little every day to keep your streak alive.",
      "Ballaringiz, kunlik intizomingiz, statistikangiz, sozlamalar va yordam. Kunlik intizomni saqlab qolish uchun har kuni ozgina shug'ullaning.",
    ),
  },
];

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Swipe cards, or Next. The row is a native scroll-snap strip, so a swipe
 * feels like the phone's own; the dots follow whichever card is centred.
 *
 * On a first visit (askLang) a language card comes first, written in both
 * languages; picking one switches the app and moves on.
 */
export default function Intro({ onDone, askLang = false, lang = null, onLang }) {
  const [index, setIndex] = useState(0);
  const strip = useRef(null);
  const settle = useRef(null);
  const cards = [...(askLang ? [{ id: "lang" }] : []), ...introCards()];
  const last = index === cards.length - 1;

  useEffect(() => showBack(onDone), [onDone]);
  useEffect(() => () => clearTimeout(settle.current), []);

  // Next moves to its card at once — the dots and the button don't wait for
  // the slide, so quick taps each count.
  const go = (i) => {
    const el = strip.current;
    if (!el) return;
    const to = Math.max(0, Math.min(cards.length - 1, i));
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
    <div className="intro" role="dialog" aria-label={t("How to use usmleengo", "usmleengodan qanday foydalanish")}>
      <button className="intro-skip" onClick={() => { haptic("light"); onDone(); }}>
        {last ? t("Close", "Yopish") : t("Skip", "O'tkazib yuborish")}
      </button>

      <div
        className="intro-strip"
        ref={strip}
        onScroll={onScroll}
      >
        {cards.map(({ id, Icon, eyebrow, title, text }, i) => (id === "lang" ? (
          <section key={id} className="intro-card" aria-hidden={i !== index}>
            <Logo size={88} className="intro-logo" />
            <h2 className="intro-title">Tilni tanlang</h2>
            <p className="intro-text" style={{ marginTop: -4 }}>Choose your language</p>
            <div className="intro-langs">
              {[["uz", "O'zbekcha"], ["en", "English"]].map(([code, name]) => (
                <button
                  key={code}
                  className={`intro-lang${lang === code ? " on" : ""}`}
                  onClick={() => { haptic("medium"); onLang(code); go(i + 1); }}
                >
                  {name}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section key={id} className="intro-card" aria-hidden={i !== index}>
            <span className="intro-icon"><Icon size={40} /></span>
            {eyebrow && <span className="intro-eyebrow">{eyebrow}</span>}
            <h2 className="intro-title">{title}</h2>
            <p className="intro-text">{text}</p>
          </section>
        )))}
      </div>

      <div className="intro-foot">
        <div className="intro-dots" aria-hidden="true">
          {cards.map((c, i) => (
            <button key={c.id} className={`intro-dot${i === index ? " on" : ""}`} tabIndex={-1} onClick={() => go(i)} />
          ))}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (last) { haptic("success"); onDone(); } else go(index + 1);
          }}
        >
          {last ? t("Start studying", "O'qishni boshlash") : t("Next", "Keyingi")}
        </button>
      </div>
    </div>
  );
}

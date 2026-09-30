import React, { useEffect, useMemo, useState } from "react";
import { t } from "../lib/i18n.js";
import { WEIGHTS, XP, formatPace, medalFor, points } from "../lib/rating.js";
import { DEVELOPER, haptic, inTelegram, openTelegram, platformText } from "../lib/telegram.js";
import { ScreenHead } from "./Chrome.jsx";
import { Chevron, ChevronDown } from "./Icons.jsx";
import { rankText, ratingData, useLiveBoard } from "./Rating.jsx";
import { Byline, Sheet, ThemePicker } from "./Sheet.jsx";

/** "#88 / 2,300" when there is anyone to be placed against. */
const placeOf = (p) => (p?.place && p.total > 1 ? rankText(p) : null);

const VERSION = typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__;

/**
 * A chat with the developer, the message already started with what a report
 * needs and people forget: which version, on which phone.
 */
function reportProblem() {
  haptic("light");
  const draft = t(
    `usmleengo problem (version ${VERSION}, ${platformText()}):\n`,
    `usmleengoda muammo (versiya ${VERSION}, ${platformText()}):\n`,
  );
  openTelegram(`${DEVELOPER}?text=${encodeURIComponent(draft)}`);
}

/**
 * "Buy me a coffee": the author's card, to send any amount to from Click,
 * Payme or a bank app. While the number is empty the row stays hidden.
 */
const COFFEE_CARD = { number: "5614 6819 1007 3679", holder: "Azizbek Muxtorov" };
const cardDigits = COFFEE_CARD.number.replace(/\D/g, "");

/**
 * The card and a copy button; then, once they say they've sent it, the
 * author's thanks and a way to write to him. The app can't see a transfer,
 * so "I've sent it" is the supporter's word.
 */
function CoffeeSheet({ onClose }) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <Sheet title={t("Thank you ☕", "Rahmat ☕")} onClose={onClose}>
        <div className="coffee-thanks">
          {t("Thank you for your donation! I’m happy you enjoy my product.",
            "Xayriyangiz uchun rahmat! Mahsulotim sizga yoqqanidan xursandman.")}
          <span className="coffee-sign">— Azizbek</span>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => {
            haptic("light");
            const note = t("☕ Sent you a coffee for usmleengo! ", "☕ usmleengo uchun sizga qahva yubordim! ");
            openTelegram(`${DEVELOPER}?text=${encodeURIComponent(note)}`);
          }}
        >
          {t("Send me a message", "Menga xabar yozing")}
        </button>
        <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={onClose}>{t("Close", "Yopish")}</button>
      </Sheet>
    );
  }
  return (
    <Sheet title={t("Buy me a coffee ☕", "Menga qahva olib bering ☕")} onClose={onClose}>
      <div className="class-note" style={{ marginTop: 0 }}>
        {t("usmleengo is free. If it helps you study, send any amount to this card — from Click, Payme or your bank app.",
          "usmleengo bepul. Agar u o'qishingizga yordam berayotgan bo'lsa, shu kartaga istalgan miqdorni yuboring — Click, Payme yoki bank ilovangiz orqali.")}
      </div>
      <div className="coffee-card">
        <span className="coffee-num">{cardDigits.replace(/(\d{4})(?=\d)/g, "$1 ")}</span>
        {COFFEE_CARD.holder && <span className="coffee-holder">{COFFEE_CARD.holder}</span>}
      </div>
      <button
        className="btn btn-primary"
        onClick={async () => {
          try { await navigator.clipboard.writeText(cardDigits); setCopied(true); haptic("success"); } catch { /* not allowed here; the number can be selected */ }
        }}
      >
        {copied ? t("Copied ✓", "Nusxalandi ✓") : t("Copy card number", "Karta raqamini nusxalash")}
      </button>
      <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => { haptic("success"); setSent(true); }}>
        {t("I’ve sent it", "Yubordim")}
      </button>
    </Sheet>
  );
}

/** O'zbekcha or English, as two words, in Settings. */
function LangPicker({ lang, onLang }) {
  return (
    <div className="theme-toggle lang-toggle" role="radiogroup" aria-label={t("Language", "Til")}>
      {[["uz", "O'zbekcha"], ["en", "English"]].map(([code, name]) => (
        <button
          key={code}
          role="radio"
          aria-checked={lang === code}
          className={`theme-opt${lang === code ? " on" : ""}`}
          onClick={() => { if (lang !== code) { haptic("light"); onLang(code); } }}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/**
 * The Me tab: the player's points and the one rank they give, the three
 * numbers the points are made of, and the app's settings. The three carry
 * their share of the points rather than places of their own — the rating is
 * points, and a day streak or an XP total is part of it, not a rank beside
 * it. The question type is not here: it shapes a round, so it sits by the
 * Start button.
 */
export default function Me({ state, standings, onRefresh, onRating, onTheme, onReset, onHowTo, onLang }) {
  useLiveBoard(onRefresh);

  const { me, places, input } = useMemo(() => ratingData(state, standings), [state, standings]);
  const r = me.rating;
  const timing = input.timing;
  const accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  const best = Math.max(state.best || 0, r.raw.streak);

  // Resetting everything is two taps apart, so a stray one while scrolling
  // cannot wipe months of progress.
  const [arming, setArming] = useState(false);
  const [coffee, setCoffee] = useState(false);
  // How XP is earned is one tap under the XP number, not a section of its own.
  const [xpOpen, setXpOpen] = useState(false);
  useEffect(() => {
    if (!arming) return undefined;
    const id = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(id);
  }, [arming]);

  const cards = [
    {
      id: "streak",
      label: t("Day streak", "Kunlik intizom"),
      value: `${r.raw.streak}`,
      unit: t(r.raw.streak === 1 ? "day" : "days", "kun"),
      detail: t(`Best ever: ${best} ${best === 1 ? "day" : "days"}`, `Eng yaxshi natija: ${best} kun`),
    },
    {
      id: "xp",
      label: "XP",
      value: r.raw.xp.toLocaleString(),
      unit: "",
      detail: t(
        `${state.answered.toLocaleString()} answered · ${accuracy}% correct`,
        `${state.answered.toLocaleString()} ta javob · ${accuracy}% to'g'ri`,
      ),
    },
    {
      id: "speed",
      label: t("Average time", "O'rtacha vaqt"),
      value: formatPace(r.raw.pace),
      unit: "",
      detail: r.raw.pace
        ? [
          timing.binaryN ? t(`Tapped ${formatPace(timing.binaryMs)}`, `Test ${formatPace(timing.binaryMs)}`) : null,
          timing.gapN ? t(`typed ${formatPace(timing.gapMs)}`, `yozma ${formatPace(timing.gapMs)}`) : null,
        ].filter(Boolean).join(" · ")
        : t("Timed on correct answers only", "Faqat to'g'ri javoblar vaqti o'lchanadi"),
    },
  ];

  return (
    <div className="screen rating">
      <ScreenHead
        title={inTelegram && me.name !== "Player" ? me.name : t("Me", "Profil")}
        sub={me.username ? `@${me.username}` : t("Your progress and settings", "Natijalaringiz va sozlamalar")}
      />

      <button className="perf-points" onClick={() => { haptic("light"); onRating(); }}>
        <span className="perf-points-l">{t("Your points", "Ballaringiz")}</span>
        <span className="perf-points-v">{points(r.overall)}</span>
        <span className="perf-points-place">
          {placeOf(places?.overall)
            ? `${medalFor(places.overall.place) ? `${medalFor(places.overall.place)} ` : ""}${t("Your rank", "O'rningiz")} ${placeOf(places.overall)} ›`
            : t("See the rating ›", "Reytingni ko'rish ›")}
        </span>
      </button>

      <div className="section-label">{t("What your points are made of", "Ballaringiz nimalardan iborat")}</div>
      <div className="perf-list">
        {cards.map((c) => {
          const body = (
            <>
              <div className="perf-main">
                <span className="perf-label">{c.label}</span>
                <span className="perf-value">
                  {c.value}{c.unit && <small> {c.unit}</small>}
                </span>
                <span className="perf-detail">{c.detail}</span>
              </div>
              <span className="perf-weight">
                {t(`${Math.round(WEIGHTS[c.id] * 100)}% of points`, `ballning ${Math.round(WEIGHTS[c.id] * 100)}%i`)}
              </span>
            </>
          );
          if (c.id !== "xp") return <div key={c.id} className="perf-card">{body}</div>;
          return (
            <React.Fragment key={c.id}>
              <button
                className="perf-card perf-tap"
                aria-expanded={xpOpen}
                aria-label={t("XP - how an answer earns it", "XP - har bir javob qancha beradi")}
                onClick={() => { haptic("light"); setXpOpen(!xpOpen); }}
              >
                {body}
                <span className={`cat-chevron${xpOpen ? " open" : ""}`}><ChevronDown /></span>
              </button>
              {xpOpen && (
                <div className="xp-rules">
                  <div className="xp-rules-t">{t("What an answer earns", "Har bir javob nima beradi")}</div>
                  <div className="xp-rule">
                    <span className="xp-amt ok">+{XP.gapCorrect}</span>
                    <span>{t(<>for a correct answer you <b>typed</b></>, <><b>yozma</b> to'g'ri javob uchun</>)}</span>
                  </div>
                  <div className="xp-rule">
                    <span className="xp-amt ok">+{XP.binaryCorrect}</span>
                    <span>{t(<>for a correct answer you <b>tapped</b></>, <><b>test</b> usulidagi to'g'ri javob uchun</>)}</span>
                  </div>
                  <div className="xp-rule">
                    <span className="xp-amt">+{XP.wrong}</span>
                    <span>{t("for a wrong answer — reading why is how it sticks", "noto'g'ri javob uchun — sababini o'qish bilimni mustahkamlaydi")}</span>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="section-label">{t("Settings", "Sozlamalar")}</div>
      <div className="set-list">
        <div className="set-row">
          <span className="set-row-t">{t("Language", "Til")}</span>
          <LangPicker lang={state.lang || "en"} onLang={onLang} />
        </div>
        <div className="set-row">
          <span className="set-row-t">{t("Appearance", "Ko'rinish")}</span>
          <ThemePicker theme={state.theme} onTheme={onTheme} />
        </div>
        <div className="set-row">
          <span>
            <span className="set-row-t">{t("Reset all progress", "Barcha natijalarni o'chirish")}</span>
            <span className="set-row-n">
              {arming
                ? t("Tap again to confirm. It cannot be undone.", "Tasdiqlash uchun yana bosing. Buni qaytarib bo'lmaydi.")
                : t("XP, streak, question history and the flashcard deck", "XP, kunlik intizom, savollar tarixi va kartochkalar")}
            </span>
          </span>
          <button
            className={`set-btn${arming ? " danger" : ""}`}
            onClick={() => {
              haptic(arming ? "warning" : "light");
              if (arming) { setArming(false); onReset(); } else setArming(true);
            }}
          >
            {arming ? t("Reset", "O'chirish") : t("Reset…", "O'chirish…")}
          </button>
        </div>
      </div>

      <div className="section-label">{t("Help & support", "Yordam va qo'llab-quvvatlash")}</div>
      <div className="set-list">
        <button className="set-row set-link" onClick={() => { haptic("light"); onHowTo(); }}>
          <span>
            <span className="set-row-t">{t("How to use usmleengo", "usmleengodan qanday foydalanish")}</span>
            <span className="set-row-n">{t("A quick tour of every tab", "Barcha bo'limlar bilan qisqacha tanishuv")}</span>
          </span>
          <Chevron />
        </button>
        <button className="set-row set-link" onClick={reportProblem}>
          <span>
            <span className="set-row-t">{t("Report a problem", "Muammo haqida xabar berish")}</span>
            <span className="set-row-n">
              {t("Something broken or wrong? Tell the developer on Telegram", "Nimadir ishlamayaptimi yoki xato bormi? Dasturchiga Telegramda yozing")}
            </span>
          </span>
          <Chevron />
        </button>
        {cardDigits && (
          <button className="set-row set-link" onClick={() => { haptic("light"); setCoffee(true); }}>
            <span>
              <span className="set-row-t">{t("Buy me a coffee ☕", "Menga qahva olib bering ☕")}</span>
              <span className="set-row-n">{t("Support usmleengo with a card transfer", "usmleengoni karta orqali qo'llab-quvvatlang")}</span>
            </span>
            <Chevron />
          </button>
        )}
      </div>
      {coffee && <CoffeeSheet onClose={() => setCoffee(false)} />}

      <Byline />
    </div>
  );
}

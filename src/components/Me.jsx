import React, { useEffect, useMemo, useState } from "react";
import { t } from "../lib/i18n.js";
import { POINTS_MAX, WEIGHTS, XP, formatPace, medalFor, points, streakScore, xpFor } from "../lib/rating.js";
import { reportProblem } from "../lib/report.js";
import { DEVELOPER, haptic, inTelegram, openTelegram } from "../lib/telegram.js";
import { ScreenHead } from "./Chrome.jsx";
import { Chevron, ChevronDown } from "./Icons.jsx";
import { rankText, ratingData, useLiveBoard } from "./Rating.jsx";
import { Byline, Sheet, ThemePicker } from "./Sheet.jsx";

/** "#88 / 2,300" when there is anyone to be placed against. */
const placeOf = (p) => (p?.place && p.total > 1 ? rankText(p) : null);

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
  // A right answer that took a minute, for the line that says what a slow one earns.
  const slowXp = xpFor({ type: "binary" }, true, 60);
  // What a run of days is worth, for the hint under the streak: read from the
  // rating itself, so it can never disagree with it.
  const streakPoints = (days) => Math.round(WEIGHTS.streak * POINTS_MAX * streakScore(days) / 100);

  // Resetting everything is two taps apart, so a stray one while scrolling
  // cannot wipe months of progress.
  const [arming, setArming] = useState(false);
  const [coffee, setCoffee] = useState(false);
  // How answers are counted is one tap under the answers card, not a section of its own.
  const [howOpen, setHowOpen] = useState(false);
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
      hint: t(
        `Study every day without missing. 30 days in a row is worth about ${streakPoints(30)} points. Miss two days and it starts again.`,
        `Har kuni bir marta ham o'tkazmasdan shug'ullaning. Ketma-ket 30 kun taxminan ${streakPoints(30)} ball beradi. Ikki kun o'tkazsangiz, qaytadan boshlanadi.`,
      ),
    },
    {
      id: "mastery",
      label: t("Right answers", "To'g'ri javoblar"),
      value: `${accuracy}%`,
      unit: "",
      detail: t(
        `${state.answered.toLocaleString()} answered · ${r.raw.xp.toLocaleString()} XP`,
        `${state.answered.toLocaleString()} ta javob · ${r.raw.xp.toLocaleString()} XP`,
      ),
      hint: t(
        "Answer questions correctly and quickly. Guessing and looking answers up earn almost nothing. Tap to see how.",
        "Savollarga to'g'ri va tez javob bering. Taxmin qilish va qidirib topish deyarli ball bermaydi. Batafsil ko'rish uchun bosing.",
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
        : t("Right answers only — reading the explanation isn't timed", "Faqat to'g'ri javoblar — izohni o'qish vaqti hisoblanmaydi"),
      hint: t(
        "How fast your right answers are. It counts only after you have answered enough questions correctly.",
        "To'g'ri javoblaringiz qanchalik tez ekani. Yetarlicha savolga to'g'ri javob berganingizdan keyingina hisoblanadi.",
      ),
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
      <p className="perf-intro">
        {t(
          "Your points (1000 at most) add up from three parts. Each has its own limit, the end of its bar.",
          "Ballaringiz (ko'pi bilan 1000) uch qismdan yig'iladi. Har birining o'z chegarasi bor — chiziqning oxiri.",
        )}
      </p>
      <div className="perf-list">
        {cards.map((c) => {
          // What this part has earned, and the most it can: the bar shows both.
          const max = Math.round(WEIGHTS[c.id] * POINTS_MAX);
          const earned = Math.round(r[c.id] * WEIGHTS[c.id] * (POINTS_MAX / 100));
          const expandable = c.id === "mastery";
          const body = (
            <>
              <div className="perf-top">
                <div className="perf-main">
                  <span className="perf-label">{c.label}</span>
                  <span className="perf-value">
                    {c.value}{c.unit && <small> {c.unit}</small>}
                  </span>
                  <span className="perf-detail">{c.detail}</span>
                </div>
                <span className="perf-earn">
                  <b>{earned}</b>
                  <small>{t("points", "ball")}</small>
                </span>
                {expandable && <span className={`cat-chevron${howOpen ? " open" : ""}`}><ChevronDown /></span>}
              </div>
              <div className="perf-bar" role="img" aria-label={t(`${earned} of ${max} points`, `${max} balldan ${earned}`)}>
                <span style={{ width: `${Math.min(100, (earned / max) * 100)}%` }} />
              </div>
              <div className="perf-scale" aria-hidden="true"><span>0</span><span>{max}</span></div>
              <div className="perf-hint">{c.hint}</div>
            </>
          );
          if (!expandable) return <div key={c.id} className="perf-card">{body}</div>;
          return (
            <React.Fragment key={c.id}>
              <button
                className="perf-card perf-tap"
                aria-expanded={howOpen}
                aria-label={t("How answers are counted", "Javoblar qanday hisoblanadi")}
                onClick={() => { haptic("light"); setHowOpen(!howOpen); }}
              >
                {body}
              </button>
              {howOpen && (
                <div className="xp-rules">
                  <div className="xp-rules-t">{t("How your answers count", "Javoblaringiz qanday hisoblanadi")}</div>
                  <div className="xp-rule">
                    <span className="xp-amt ok">✓</span>
                    <span>{t(<><b>Right and quick</b> — full points.</>, <><b>To'g'ri va tez</b> — to'liq ball.</>)}</span>
                  </div>
                  <div className="xp-rule">
                    <span className="xp-amt ok">~</span>
                    <span>{t(<><b>Right but slow</b> — fewer points. A long wait looks like looking it up.</>, <><b>To'g'ri, lekin uzoq o'ylangan</b> — kamroq ball. Uzoq kutish qidirib topishga o'xshaydi.</>)}</span>
                  </div>
                  <div className="xp-rule">
                    <span className="xp-amt">✗</span>
                    <span>{t(<><b>Wrong tap</b> — takes points back, so guessing doesn't pay.</>, <><b>Noto'g'ri bosish</b> — ballni kamaytiradi, shuning uchun taxmin qilishdan foyda yo'q.</>)}</span>
                  </div>
                  <div className="xp-rule">
                    <span className="xp-amt">½</span>
                    <span>{t(<><b>The same question again</b> — half as much each time.</>, <><b>Bir xil savol qayta chiqsa</b> — har safar yarmiga kam.</>)}</span>
                  </div>
                  <div className="xp-note">
                    {t("The clock starts when the question appears and stops when you answer. Reading the explanation is never counted.",
                      "Vaqt savol chiqqanda boshlanadi va javob berganingizda to'xtaydi. Izohni o'qish vaqti hech qachon hisoblanmaydi.")}
                  </div>
                  <div className="xp-note">
                    {t(`XP is a separate counter of how much you have done: right and quick +${XP.binaryCorrect} (typed +${XP.gapCorrect}), right but slow +${slowXp}, wrong +${XP.wrong}. It is not part of your points.`,
                      `XP — alohida hisoblagich, qancha shug'ullanganingizni ko'rsatadi: to'g'ri va tez +${XP.binaryCorrect} (yozma +${XP.gapCorrect}), to'g'ri lekin sekin +${slowXp}, noto'g'ri +${XP.wrong}. U ballaringizga kirmaydi.`)}
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

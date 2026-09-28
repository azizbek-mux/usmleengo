import React, { useEffect, useMemo, useState } from "react";
import { WEIGHTS, XP, formatPace, medalFor, points } from "../lib/rating.js";
import { DEVELOPER, haptic, inTelegram, openTelegram, platformText } from "../lib/telegram.js";
import { ScreenHead } from "./Chrome.jsx";
import { Chevron } from "./Icons.jsx";
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
  const draft = `usmleengo problem (version ${VERSION}, ${platformText()}):\n`;
  openTelegram(`${DEVELOPER}?text=${encodeURIComponent(draft)}`);
}

/**
 * "Buy me a coffee": the author's card, to send any amount to from Click,
 * Payme or a bank app. While the number is empty the row stays hidden.
 */
const COFFEE_CARD = { number: "", holder: "" };
const cardDigits = COFFEE_CARD.number.replace(/\D/g, "");

/** The card, a copy button, and a way to say something with it. */
function CoffeeSheet({ onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Sheet title="Buy me a coffee ☕" onClose={onClose}>
      <div className="class-note" style={{ marginTop: 0 }}>
        usmleengo is free. If it helps you study, send any amount to this card — from Click, Payme or
        your bank app.
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
        {copied ? "Copied ✓" : "Copy card number"}
      </button>
      <button
        className="btn btn-ghost"
        style={{ marginTop: 8 }}
        onClick={() => { haptic("light"); openTelegram(`${DEVELOPER}?text=${encodeURIComponent("☕ Sent you a coffee for usmleengo! ")}`); }}
      >
        Send a message with it
      </button>
    </Sheet>
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
export default function Me({ state, standings, onRefresh, onRating, onTheme, onReset }) {
  useLiveBoard(onRefresh);

  const { me, places, input } = useMemo(() => ratingData(state, standings), [state, standings]);
  const r = me.rating;
  const t = input.timing;
  const accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;
  const best = Math.max(state.best || 0, r.raw.streak);

  // Resetting everything is two taps apart, so a stray one while scrolling
  // cannot wipe months of progress.
  const [arming, setArming] = useState(false);
  const [coffee, setCoffee] = useState(false);
  useEffect(() => {
    if (!arming) return undefined;
    const id = setTimeout(() => setArming(false), 4000);
    return () => clearTimeout(id);
  }, [arming]);

  const cards = [
    {
      id: "streak",
      label: "Day streak",
      value: `${r.raw.streak}`,
      unit: r.raw.streak === 1 ? "day" : "days",
      detail: `Best ever: ${best} ${best === 1 ? "day" : "days"}`,
    },
    {
      id: "xp",
      label: "XP",
      value: r.raw.xp.toLocaleString(),
      unit: "",
      detail: `${state.answered.toLocaleString()} answered · ${accuracy}% correct`,
    },
    {
      id: "speed",
      label: "Average time",
      value: formatPace(r.raw.pace),
      unit: "",
      detail: r.raw.pace
        ? [t.binaryN ? `Tapped ${formatPace(t.binaryMs)}` : null, t.gapN ? `typed ${formatPace(t.gapMs)}` : null]
          .filter(Boolean).join(" · ")
        : "Timed on correct answers only",
    },
  ];

  return (
    <div className="screen rating">
      <ScreenHead
        title={inTelegram && me.name !== "Player" ? me.name : "Me"}
        sub={me.username ? `@${me.username}` : "Your progress and settings"}
      />

      <button className="perf-points" onClick={() => { haptic("light"); onRating(); }}>
        <span className="perf-points-l">Your points</span>
        <span className="perf-points-v">{points(r.overall)}</span>
        <span className="perf-points-place">
          {placeOf(places?.overall)
            ? `${medalFor(places.overall.place) ? `${medalFor(places.overall.place)} ` : ""}Your rank ${placeOf(places.overall)} ›`
            : "See the rating ›"}
        </span>
      </button>

      <div className="section-label">What your points are made of</div>
      <div className="perf-list">
        {cards.map((c) => (
          <div key={c.id} className="perf-card">
            <div className="perf-main">
              <span className="perf-label">{c.label}</span>
              <span className="perf-value">
                {c.value}{c.unit && <small> {c.unit}</small>}
              </span>
              <span className="perf-detail">{c.detail}</span>
            </div>
            <span className="perf-weight">{Math.round(WEIGHTS[c.id] * 100)}% of points</span>
          </div>
        ))}
      </div>

      <div className="section-label">Settings</div>
      <div className="set-list">
        <div className="set-row">
          <span className="set-row-t">Appearance</span>
          <ThemePicker theme={state.theme} onTheme={onTheme} />
        </div>
        <div className="set-row">
          <span>
            <span className="set-row-t">Reset all progress</span>
            <span className="set-row-n">
              {arming ? "Tap again to confirm. It cannot be undone." : "XP, streak, question history and the flashcard deck"}
            </span>
          </span>
          <button
            className={`set-btn${arming ? " danger" : ""}`}
            onClick={() => {
              haptic(arming ? "warning" : "light");
              if (arming) { setArming(false); onReset(); } else setArming(true);
            }}
          >
            {arming ? "Reset" : "Reset…"}
          </button>
        </div>
      </div>

      <div className="section-label">What an answer earns</div>
      <div className="xp-rules">
        <div className="xp-rule">
          <span className="xp-amt ok">+{XP.gapCorrect}</span>
          <span>for a correct answer you <b>typed</b></span>
        </div>
        <div className="xp-rule">
          <span className="xp-amt ok">+{XP.binaryCorrect}</span>
          <span>for a correct answer you <b>tapped</b></span>
        </div>
        <div className="xp-rule">
          <span className="xp-amt">+{XP.wrong}</span>
          <span>for a wrong answer — reading why is how it sticks</span>
        </div>
      </div>

      <div className="section-label">Help &amp; support</div>
      <div className="set-list">
        <button className="set-row set-link" onClick={reportProblem}>
          <span>
            <span className="set-row-t">Report a problem</span>
            <span className="set-row-n">Something broken or wrong? Tell the developer on Telegram</span>
          </span>
          <Chevron />
        </button>
        {cardDigits && (
          <button className="set-row set-link" onClick={() => { haptic("light"); setCoffee(true); }}>
            <span>
              <span className="set-row-t">Buy me a coffee ☕</span>
              <span className="set-row-n">Support usmleengo with a card transfer</span>
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

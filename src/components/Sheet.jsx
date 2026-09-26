import React, { useEffect } from "react";
import { QTYPES } from "../lib/qtypes.js";
import { CHANNEL, haptic, openTelegram } from "../lib/telegram.js";
import { THEMES, resolveTheme } from "../lib/theme.js";
import { XP } from "../lib/rating.js";

/**
 * The credit line, shared by every sheet that shows one.
 *
 * A real anchor, so it can be long-pressed and copied, but the click is
 * intercepted: inside Telegram the webview must not navigate to t.me itself,
 * or the Mini App is replaced by a web page and the only way back is
 * reopening it from the bot.
 */
export function Byline() {
  return (
    <div className="byline">
      designed by{" "}
      <a
        className="byline-link"
        href={CHANNEL}
        onClick={(e) => { e.preventDefault(); haptic("light"); openTelegram(CHANNEL); }}
      >
        mukhtorov
      </a>
    </div>
  );
}

/**
 * Light or dark, as a sun and a moon and nothing else, offered in both
 * halves of the app — someone who lives in Medical English should not have
 * to go and find the quiz settings.
 *
 * Before the user has chosen, the symbol lit is whichever palette "auto" is
 * actually showing, so the switcher always tells the truth about the screen.
 */
export function ThemePicker({ theme, onTheme }) {
  const current = resolveTheme(theme);
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Appearance">
      {THEMES.map((t) => (
        <button
          key={t.id}
          role="radio"
          aria-checked={current === t.id}
          aria-label={t.label}
          className={`theme-opt${current === t.id ? " on" : ""}`}
          onClick={() => { haptic("light"); onTheme(t.id); }}
        >
          {t.id === "light" ? <Sun /> : <Moon />}
        </button>
      ))}
    </div>
  );
}

const Sun = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
  </svg>
);

const Moon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" />
  </svg>
);

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

export function SettingsSheet({ state, onQType, onTheme, onReset, onClose }) {
  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="section-label" style={{ marginTop: 4 }}>Question type</div>
      <div className="opt-list">
        {QTYPES.map((t) => (
          <button
            key={t.id}
            className={`opt-row${state.qtype === t.id ? " on" : ""}`}
            onClick={() => { haptic("light"); onQType(t.id); }}
          >
            <div>
              <div className="opt-name">{t.name}</div>
              <div className="opt-note">{t.note}</div>
            </div>
            <span className="tick">{state.qtype === t.id ? "✓" : ""}</span>
          </button>
        ))}
      </div>

      <ThemePicker theme={state.theme} onTheme={onTheme} />

      <div className="section-label">Your progress</div>
      <div className="stat-grid">
        <div className="mini"><b>{state.answered}</b><span>answered</span></div>
        <div className="mini"><b>{state.answered ? Math.round((state.correct / state.answered) * 100) : 0}%</b><span>correct</span></div>
        <div className="mini"><b>{state.best}</b><span>best streak</span></div>
      </div>

      <button className="btn btn-danger" onClick={onReset}>Reset all progress</button>
      <div className="cta-note">Clears XP, streak and question history. Cannot be undone.</div>

      <Byline />
    </Sheet>
  );
}

export function XpSheet({ state, onClose }) {
  const accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;

  return (
    <Sheet title="What is XP?" onClose={onClose}>
      <p className="prose">
        XP stands for <b>experience points</b>. It is a running total of the practice
        you have done — not a grade. Nobody else sees it unless you put yourself on
        the rating board.
      </p>

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
          <span>for every question you get wrong</span>
        </div>
      </div>

      <p className="prose">
        Typing pays more because it is harder: two options hand you the answer and
        ask you to recognise it, and one of them is right by chance alone. Producing
        it from nothing is the skill the exam tests.
      </p>

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

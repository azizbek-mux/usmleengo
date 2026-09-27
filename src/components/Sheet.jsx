import React, { useEffect } from "react";
import { CHANNEL, haptic, openTelegram } from "../lib/telegram.js";
import { THEMES, resolveTheme } from "../lib/theme.js";

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
 * Light or dark, as a sun and a moon and nothing else, in the Me tab's
 * settings.
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

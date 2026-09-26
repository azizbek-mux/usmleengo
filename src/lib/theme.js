// Which palette the app paints in.
//
// Three settings. "auto" follows whatever the user already chose elsewhere —
// Telegram's own light/dark setting inside the Mini App, the operating
// system's outside it — so most people never have to touch this. "light" and
// "dark" pin it for the people who want the app to disagree with the rest of
// their phone.
//
// The stylesheet holds both palettes; everything here does is decide which one
// is active and keep the chrome around the app in step with it.

import { colorScheme, onThemeChange, setChrome } from "./telegram.js";

export const THEMES = [
  { id: "auto", name: "Match my phone", note: "Follows your Telegram or system setting" },
  { id: "light", name: "Light", note: "Day colours, whatever your phone is set to" },
  { id: "dark", name: "Dark", note: "Night colours, whatever your phone is set to" },
];

/** The background the chrome should match, per palette. Mirrors styles.css. */
const CHROME = { dark: "#0f1115", light: "#f7f9fb" };

const mq = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: light)")
    : null;

/** Turn a preference into the palette actually painted: "light" or "dark". */
export function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  // Telegram is asked first: inside a Mini App its setting is the one the user
  // sees around the app, and it does not always match the operating system.
  const tgScheme = colorScheme();
  if (tgScheme) return tgScheme;
  return mq()?.matches ? "light" : "dark";
}

/**
 * Paint a preference. Sets the attribute the stylesheet keys off, then brings
 * the surrounding chrome with it: Telegram's header and background, and the
 * browser's theme-color, which is what the status bar picks up.
 */
export function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", CHROME[resolved]);
  }
  setChrome(CHROME[resolved]);
  return resolved;
}

/**
 * Call back whenever the phone's own setting changes, so "auto" keeps up
 * without a reload. Returns an unsubscribe.
 */
export function watchSystemTheme(onChange) {
  const media = mq();
  const handler = () => onChange();
  media?.addEventListener?.("change", handler);
  const offTelegram = onThemeChange(handler);

  // Belt and braces. Some webviews update what the media query answers without
  // ever firing its change event, so the app would sit in yesterday's palette
  // until it was reopened. Re-reading whenever it comes back to the foreground
  // costs nothing and covers the case where the user went to their settings,
  // switched to night mode, and came back.
  const onVisible = () => { if (!document.hidden) onChange(); };
  document.addEventListener?.("visibilitychange", onVisible);

  return () => {
    media?.removeEventListener?.("change", handler);
    document.removeEventListener?.("visibilitychange", onVisible);
    offTelegram();
  };
}

// Telling the developer something is wrong, from inside the app.
//
// Both go to the developer's own Telegram chat with the message already
// started, so the report arrives with what is needed to act on it - which
// version, which phone, and for a question, its id - and the person only has
// to say what is wrong.

import { t } from "./i18n.js";
import { DEVELOPER, haptic, openTelegram, platformText } from "./telegram.js";

const VERSION = typeof __APP_VERSION__ === "undefined" ? "dev" : __APP_VERSION__;

// The longest part of a question quoted in the message. Enough to recognise it
// at a glance; the id is what finds it.
const QUOTE = 220;

const open = (draft) => openTelegram(`${DEVELOPER}?text=${encodeURIComponent(draft)}`);

/** Something is broken or wrong in the app itself. */
export function reportProblem() {
  haptic("light");
  open(t(
    `usmleengo problem (version ${VERSION}, ${platformText()}):\n`,
    `usmleengoda muammo (versiya ${VERSION}, ${platformText()}):\n`,
  ));
}

/**
 * A question that is wrong, unclear or badly translated. The id is the
 * question's own, the same in English and Uzbek, so it finds it in either
 * file; the text quoted is whatever the person was reading.
 */
export function reportQuestion(q) {
  haptic("light");
  const text = String(q.q || "").replace(/\s+/g, " ").trim();
  const quoted = text ? (text.length > QUOTE ? `${text.slice(0, QUOTE)}…` : text) : t("(a picture question)", "(rasmli savol)");
  open([
    t("usmleengo - a question to check", "usmleengo - tekshiriladigan savol"),
    `id: ${q.id}`,
    `${t("version", "versiya")} ${VERSION}, ${platformText()}`,
    quoted,
    "",
    t("What is wrong with it?", "Unda nima xato?") + " ",
  ].join("\n"));
}

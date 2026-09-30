// The app's two languages, English and Uzbek.
//
// Every piece of text is written as a pair where it is used —
// t("Start", "Boshlash") — so the Uzbek sits beside the English it
// translates and the two are read and corrected together. The words the
// owner agreed for Uzbek are in src/data/uz/TERMS.md.
//
// The language lives in the player's saved progress (state.lang). App sets
// it here before each render and remounts the screens when it changes.

let current = "en";

export const LANGS = ["en", "uz"];

export function setLang(lang) {
  current = lang === "uz" ? "uz" : "en";
  if (typeof document !== "undefined") document.documentElement.lang = current;
}

export const lang = () => current;
export const isUz = () => current === "uz";

/** The text in the current language. */
export const t = (en, uz) => (current === "uz" ? uz : en);

const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
const UZ_DAYS = ["yakshanba", "dushanba", "seshanba", "chorshanba", "payshanba", "juma", "shanba"];

/**
 * A day, written the way each language writes it: "Fri 3 Oct" or
 * "3-oktyabr, juma". Browsers' own Uzbek dates vary from phone to phone, so
 * the Uzbek is built here.
 */
export function dayText(ms) {
  const d = new Date(ms);
  if (current !== "uz") return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${UZ_DAYS[d.getDay()]}`;
}

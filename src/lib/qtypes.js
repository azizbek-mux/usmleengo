import { t } from "./i18n.js";

/**
 * The three practice modes, worded once.
 *
 * The Quiz tab's question-type picker renders this list. A new player who
 * never opens it gets the mix of both.
 */
export const QTYPES = () => [
  { id: "random", name: t("Mix of both", "Aralash"), note: t("Tapping and typing together", "Test va yozma javob birga") },
  { id: "binary", name: t("Multiple choice only", "Faqat test"), note: t("Two options, one tap", "Ikki variant, bitta bosish") },
  { id: "gap", name: t("Fill the gap only", "Faqat yozma javob"), note: t("Type the answer yourself", "Javobni o'zingiz yozasiz") },
];

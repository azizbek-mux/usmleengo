// Category names as the app shows them: short, and about the same length,
// so a row of chips reads evenly. The tags in the question bank are
// unchanged; only what is printed on a chip or in a summary is.

import { isUz } from "./i18n.js";

const SHORT = {
  endocrine: "endo",
  genetics: "gen",
  oncology: "onco",
};

// The Uzbek names agreed with the owner (src/data/uz/TERMS.md). These are
// every category a chip or a summary can show: the twelve biggest subjects
// and the two picture ones.
const UZ = {
  pharm: "farma",
  endocrine: "endo",
  micro: "mikro",
  neuro: "nevro",
  cardio: "kardio",
  gi: "gastro",
  renal: "nefro",
  genetics: "gen",
  resp: "pulmo",
  oncology: "onko",
  immuno: "immun",
  peds: "pediatr",
  histo: "gisto",
  radio: "radio",
};

export const tagLabel = (tag) => (isUz() && UZ[tag]) || SHORT[tag] || tag;

/**
 * The picture categories. Named here rather than derived, because these two
 * are the whole point of the picture bank and keep a fixed order. Both the
 * quiz home and the multiplayer setup offer them first.
 */
export const PICTURE_TAGS = ["histo", "radio"];

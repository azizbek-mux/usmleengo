// Category names as the app shows them: short, and about the same length,
// so a row of chips reads evenly. The tags in the question bank are
// unchanged; only what is printed on a chip or in a summary is.

const SHORT = {
  endocrine: "endo",
  genetics: "gen",
  oncology: "onco",
};

export const tagLabel = (tag) => SHORT[tag] || tag;

/**
 * The picture categories. Named here rather than derived, because these two
 * are the whole point of the picture bank and keep a fixed order. Both the
 * quiz home and the multiplayer setup offer them first.
 */
export const PICTURE_TAGS = ["histo", "radio"];

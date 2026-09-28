// Both palettes, checked for legibility.
//
// A light theme is easy to add and easy to get subtly wrong: the accent that
// reads beautifully on near-black is 1.9:1 on white, and nothing in a build
// complains. This reads the tokens straight out of styles.css and puts every
// pair that actually appears on screen through the WCAG contrast formula, so
// a future colour tweak either keeps the app readable or fails here.

import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

/** The token block for a selector, as { name: value }. */
function palette(selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`no ${selector} block in styles.css`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const out = {};
  for (const line of css.slice(open + 1, close).split("\n")) {
    const m = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function channel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const dark = palette(":root {");
const light = palette(':root[data-theme="light"]');

// Every pair below is a real pairing in the stylesheet: the token that colours
// some text, and the token that colours whatever sits behind it.
//   4.5 — body text and anything small
//   3.0 — text at 18px bold and up, and the edges of controls
const PAIRS = [
  ["--text", "--bg", 4.5, "body text on the page"],
  ["--text", "--card", 4.5, "text on a card"],
  ["--muted", "--bg", 4.5, "secondary text on the page"],
  ["--muted", "--card", 4.5, "secondary text on a card"],
  ["--muted", "--card-hi", 4.5, "preset labels"],
  ["--accent", "--bg", 4.5, "accent text on the page"],
  ["--accent", "--card-hi", 3.0, "topic chip"],
  ["--on-accent", "--accent", 4.5, "label on the primary button"],
  ["--accent-soft", "--accent-dim", 4.5, "the correct answer, once revealed"],
  ["--wrong-text", "--wrong-dim", 4.5, "a wrong answer, once revealed"],
  ["--gold", "--bg", 4.5, "the streak count"],
  ["--gold", "--card", 4.5, "the streak count on a card"],
  ["--gold", "--card", 4.5, "first place's points on the rating"],
  ["--silver", "--card", 4.5, "second place's points"],
  ["--bronze", "--card", 4.5, "third place's points"],
  ["--streak-label", "--streak-a", 4.5, "the streak banner's caption"],
  ["--new", "--card", 4.5, "Anki's new-card count"],
  ["--learn", "--card", 4.5, "Anki's learning count"],
  ["--wrong", "--bg", 3.0, "the incorrect share of the result bar"],
  ["--wrong-edge", "--card", 1.5, "the edge of Anki’s Again button"],
];

for (const [name, tokens] of [["dark", dark], ["light", light]]) {
  console.log(`\nthe ${name} palette`);
  for (const [fg, bg, min, what] of PAIRS) {
    const a = tokens[fg], b = tokens[bg];
    if (!a || !b) { check(`${what} (${fg} on ${bg})`, false, "— token missing"); continue; }
    const ratio = contrast(a, b);
    check(
      `${what} reaches ${min}:1`,
      ratio >= min,
      `— ${fg} ${a} on ${bg} ${b} is ${ratio.toFixed(2)}:1`,
    );
  }
}

console.log("\nthe two palettes line up");
// Shape and easing are not themed, only colour is.
const NOT_COLOUR = new Set(["--radius", "--tap"]);
const colours = (p) => Object.keys(p).filter((k) => !NOT_COLOUR.has(k));
const missing = colours(dark).filter((k) => !(k in light));
check("light defines every colour dark does", missing.length === 0, `— missing ${missing.join(", ")}`);
const stray = colours(light).filter((k) => !(k in dark));
check("and introduces none of its own", stray.length === 0, `— extra ${stray.join(", ")}`);

// theme.js paints Telegram's header and the browser's status bar. If it drifts
// from the stylesheet the app gets a stripe of the wrong colour above it.
const themeJs = readFileSync(new URL("../src/lib/theme.js", import.meta.url), "utf8");
const chrome = themeJs.match(/CHROME\s*=\s*\{\s*dark:\s*"(#[0-9a-f]{6})",\s*light:\s*"(#[0-9a-f]{6})"/i);
check("the chrome colours were found in theme.js", Boolean(chrome));
if (chrome) {
  check("the header matches the dark background", chrome[1].toLowerCase() === dark["--bg"].toLowerCase(),
    `— theme.js ${chrome[1]} vs css ${dark["--bg"]}`);
  check("the header matches the light background", chrome[2].toLowerCase() === light["--bg"].toLowerCase(),
    `— theme.js ${chrome[2]} vs css ${light["--bg"]}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

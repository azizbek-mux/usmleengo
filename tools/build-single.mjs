// Bundles the built app into ONE self-contained HTML file.
//
// Used for the shareable demo: a sandboxed page cannot fetch a sibling asset,
// so the stylesheet, the script and the whole question bank are inlined.
//
// Emits body-level content only (no <html>/<head>/<body>), which is the shape
// the Artifact host expects — it supplies the document skeleton itself.
//
// Run: npm run build:single   (assumes `npm run build` has already run)

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const ASSETS = join(DIST, "assets");
const OUT = join(ROOT, "demo.html");

const files = readdirSync(ASSETS);
const cssFile = files.find((f) => f.endsWith(".css"));
const jsFile = files.find((f) => f.endsWith(".js"));
if (!cssFile || !jsFile) {
  console.error("No built assets found — run `npm run build` first.");
  process.exit(1);
}

const css = readFileSync(join(ASSETS, cssFile), "utf8");
const js = readFileSync(join(ASSETS, jsFile), "utf8");
const questions = readFileSync(join(ROOT, "public", "questions.json"), "utf8");

// `</script>` inside a JSON string would close the enclosing tag early.
const safeJson = questions.replace(/<\//g, "<\\/");

const html = `<title>USMLE Drops</title>

<style>
${css}
</style>

<div id="root"></div>

<script>window.__QUESTIONS__ = ${safeJson};</script>
<script type="module">
${js}
</script>
`;

writeFileSync(OUT, html, "utf8");

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
console.log(`wrote ${OUT}`);
console.log(`  css       ${kb(css.length)}`);
console.log(`  js        ${kb(js.length)}`);
console.log(`  questions ${kb(questions.length)}  (${JSON.parse(questions).length} items)`);
console.log(`  total     ${kb(html.length)}`);

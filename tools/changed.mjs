// Decides whether this build needs to deploy at all.
//
// The board is checked every five minutes, and almost every check finds
// nothing new. Rebuilding and redeploying the whole site 288 times a day to
// publish identical files would be slow, noisy in the deploy history, and
// rude to GitHub. So a routine check deploys only when something the app
// reads at runtime actually changed:
//
//   public/leaderboard.json   — a new score, someone leaving, or the read
//                               position moving past rejected messages
//   public/announcement.json  — a new tagged post, or the old one expiring
//
// Both are compared with the copy already live, ignoring the timestamp.
//
// A push always deploys (the code changed), and so does pressing "Run
// workflow" on GitHub (someone wants a deploy). Only the routine five-minute
// checks — GitHub's own timer, and the outside timer that calls the workflow
// with force=false — are allowed to skip.
//
// Writes deploy=true|false to $GITHUB_OUTPUT. Any doubt means deploy: a
// missing file, an unreadable live copy. Deploying needlessly costs forty
// seconds; wrongly skipping would leave the app behind.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = process.env.SITE_URL || "https://azizbek-mux.github.io/usmleengo/";
const FILES = ["leaderboard.json", "announcement.json"];

/**
 * JSON with every object's keys sorted, all the way down, so two values that
 * mean the same thing compare equal however they were built.
 *
 * Not JSON.stringify with an array of key names: that array filters keys at
 * every depth, so the players' own fields would silently vanish and two
 * boards differing only in someone's XP would compare equal — and the new
 * score would never deploy.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The parts of a file that matter: everything but when it was written. */
export function essence(text) {
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const { updatedAt, ...rest } = value; // eslint-disable-line no-unused-vars
      return canonical(rest);
    }
    return canonical(value);
  } catch {
    return null; // not JSON: never equal to anything, so it deploys
  }
}

/** Would publishing `local` change what the app sees, given `live`? */
export function differs(local, live) {
  if (local === null || live === null) return true;
  const a = essence(local);
  const b = essence(live);
  return a === null || b === null || a !== b;
}

/**
 * Is this run allowed to skip? Only the routine checks are.
 *   push                           → never
 *   workflow_dispatch, force unset → never (a person pressed Run workflow)
 *   workflow_dispatch, force=false → yes (the five-minute outside timer)
 *   schedule                       → yes (GitHub's own timer)
 */
export function mayskip(event, force) {
  if (event === "schedule") return true;
  if (event === "workflow_dispatch") return String(force).toLowerCase() === "false";
  return false;
}

async function liveCopy(name) {
  try {
    const res = await fetch(`${LIVE}${name}?t=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function main() {
  const event = process.env.EVENT || "";
  const force = process.env.FORCE ?? "";
  let deploy = true;
  let reason = `${event || "unknown event"} always deploys`;

  if (mayskip(event, force)) {
    const changed = [];
    for (const name of FILES) {
      const path = join(ROOT, "public", name);
      const local = existsSync(path) ? readFileSync(path, "utf8") : null;
      if (differs(local, await liveCopy(name))) changed.push(name);
    }
    deploy = changed.length > 0;
    reason = deploy ? `changed: ${changed.join(", ")}` : "nothing new — the live site is already current";
  }

  console.log(`deploy             : ${deploy ? "yes" : "no"} (${reason})`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // On any failure, deploy. See the header.
  main().catch((err) => {
    console.log(`deploy             : yes (the check itself failed: ${err.name})`);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, "deploy=true\n");
  });
}

// Builds the public leaderboard from scores players sent to the bot.
//
// A player taps "Put me on the board" in the app, which opens the bot with
// their score packed into a start link (see src/lib/scorecard.js). Pressing
// Start sends "/start r1_..." to the bot. On every scheduled build this reads
// those messages, keeps the newest score per player, and writes
// public/leaderboard.json for the app to rank against.
//
// Why the Bot API here, when the announcement fetcher goes out of its way to
// avoid it: messages sent *to* a bot have no public page to scrape, so the API
// is the only way to read them. The reason the announcement fetcher avoids it
// still holds — a token can never go in the page — but this runs on a GitHub
// runner, and the token lives in the repository's Actions secrets as
// BOT_TOKEN. It never reaches the browser, the built files, or the log.
//
// Where the board is kept between builds: on the live site. There is no
// database, so each build starts from the leaderboard.json it deployed last
// time, adds whatever arrived since, and deploys the result. Telegram holds
// unread bot messages for 24 hours and a build runs every 30 minutes, so
// nothing is lost unless the site is down for a day.
//
// Failure is almost never fatal. No token, Telegram unreachable, a webhook on
// the bot, a malformed message — each of those costs at most the newest
// scores, never the deploy, and never the scores already on the board.
//
// The one exception is not being able to read last build's board. A Pages
// deploy replaces the whole site, so a build that went ahead without the
// board would publish a site with no board on it, and the build after that
// would find nothing and start from empty — every player gone. Failing that
// one build instead leaves the current site, board and all, exactly as it is,
// and the next scheduled run tries again.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decodeScore, displayName, emptyBoard, playerKey, sanitizeBoard } from "../src/lib/scorecard.js";

// Shared with the app, which checks the published board with the same code.
export { emptyBoard, sanitizeBoard };

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "leaderboard.json");

/** Where last build's board is served from. */
const LIVE = process.env.LEADERBOARD_URL || "https://azizbek-mux.github.io/usmleengo/leaderboard.json";

const DAY_MS = 86400000;
// getUpdates hands back at most 100 at a time; this many pages is 2,000
// submissions in half an hour, far past anything this app will see.
const MAX_PAGES = 20;

/* ── the board ───────────────────────────────────────────────────────────── */

const isCount = (n) => Number.isInteger(n) && n >= 0;

/** The payload of "/start <payload>", or null for anything else. */
export function startPayload(text) {
  const m = String(text || "").match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{1,64})\s*$/);
  return m ? m[1] : null;
}

/**
 * Fold a batch of Telegram updates into the board.
 *
 * Only private messages from people count — never groups, never bots. The
 * newest message from a player wins, by Telegram's own timestamp, so an old
 * update arriving late cannot roll a score back.
 *
 * Returns what happened, for the build log.
 */
export function applyUpdates(board, updates) {
  const log = { accepted: 0, left: 0, rejected: [] };

  for (const u of [...updates].sort((a, b) => a.update_id - b.update_id)) {
    if (isCount(u.update_id)) board.lastUpdateId = Math.max(board.lastUpdateId, u.update_id);

    const msg = u.message;
    if (!msg || msg.chat?.type !== "private" || !msg.from || msg.from.is_bot) continue;

    const payload = startPayload(msg.text);
    if (!payload) continue; // an ordinary /start, or a chat message

    const key = playerKey(msg.from.id);
    if (!key) continue;
    const sentAt = Number(msg.date) || 0;
    const previous = board.players[key];
    if (previous && previous.sentAt > sentAt) continue;

    const result = decodeScore(payload, Math.floor((sentAt * 1000) / DAY_MS));
    if (!result.ok) {
      log.rejected.push(result.reason);
      continue;
    }
    if (result.leave) {
      if (board.players[key]) log.left++;
      delete board.players[key];
      continue;
    }

    board.players[key] = { name: displayName(msg.from), ...result.score, sentAt };
    log.accepted++;
  }
  return log;
}

/* ── network ─────────────────────────────────────────────────────────────── */

/**
 * Last build's board. A 404 is the one safe "nothing yet" — it means no board
 * has ever been deployed. Anything else going wrong means a board exists that
 * could not be read, and that is reported as null so main() can refuse to
 * build over it.
 *
 * A stale copy from a cache is harmless: its lastUpdateId is older, so the
 * next read from Telegram simply starts earlier and picks up the same
 * messages again. Telegram only forgets a message once an offset past it has
 * been asked for, and offsets only ever come from a board that was deployed.
 */
async function fetchLive() {
  try {
    const res = await fetch(`${LIVE}?t=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
    if (res.status === 404) return { board: emptyBoard(), note: "no board deployed yet, starting fresh" };
    if (!res.ok) return { board: null, note: `live board returned ${res.status}` };
    const json = await res.json();
    return { board: sanitizeBoard(json), note: "carried forward from the live site" };
  } catch (err) {
    return { board: null, note: `could not read the live board (${err.name})` };
  }
}

/**
 * Every unread update after `offset`.
 *
 * Asking from an offset also tells Telegram everything before it has been
 * handled, which is why the offset is only ever taken from a board that was
 * successfully deployed: if this build fails, the next one asks from the same
 * place and gets the same messages again.
 *
 * Error messages are written by hand, never passed through — a fetch error can
 * carry the request URL, and this URL contains the token.
 */
async function readUpdates(token, offset) {
  const all = [];
  let next = offset;
  for (let page = 0; page < MAX_PAGES; page++) {
    let body;
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offset: next, limit: 100, timeout: 0, allowed_updates: ["message"] }),
      });
      body = await res.json().catch(() => null);
      if (res.status === 401) return { updates: all, note: "the bot token was refused — check the BOT_TOKEN secret" };
      if (res.status === 409) return { updates: all, note: "the bot has a webhook set, so its messages cannot be read this way" };
      if (!res.ok || !body?.ok) return { updates: all, note: `Telegram answered ${res.status}` };
    } catch (err) {
      return { updates: all, note: `could not reach Telegram (${err.name})` };
    }
    const batch = Array.isArray(body.result) ? body.result : [];
    if (!batch.length) break;
    all.push(...batch);
    next = Math.max(...batch.map((u) => u.update_id)) + 1;
    if (batch.length < 100) break;
  }
  return { updates: all, note: null };
}

/* ── run ─────────────────────────────────────────────────────────────────── */

function write(board) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(board), "utf8");
}

async function main() {
  const live = await fetchLive();
  console.log(`leaderboard        : ${live.note}`);

  // See the header: deploying without the board would erase it. Stop the
  // build so the site that is already live stays live.
  if (!live.board) {
    console.log("leaderboard        : stopping this build so the live board is not overwritten");
    process.exitCode = 1;
    return;
  }
  const board = live.board;

  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.log("leaderboard        : BOT_TOKEN is not set, so no new scores were read");
  } else {
    const { updates, note } = await readUpdates(token, board.lastUpdateId + 1);
    if (note) console.log(`leaderboard        : ${note}`);
    const log = applyUpdates(board, updates);
    console.log(`messages read      : ${updates.length}`);
    console.log(`scores accepted    : ${log.accepted}${log.left ? `, ${log.left} left the board` : ""}`);
    if (log.rejected.length) {
      const counts = {};
      for (const r of log.rejected) counts[r] = (counts[r] || 0) + 1;
      console.log(`scores rejected    : ${Object.entries(counts).map(([r, n]) => `${n} ${r}`).join("; ")}`);
    }
  }

  board.updatedAt = new Date().toISOString();
  write(board);
  console.log(`players on board   : ${Object.keys(board.players).length}`);
}

// Run only when invoked directly, so the tests can import the functions above
// without touching the network or the bot.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    // Something unexpected, after the board was read. Fail rather than risk
    // deploying a half-built one; err.name only, never err.message, which
    // could quote a URL with the token in it.
    console.log(`leaderboard failed : ${err.name}`);
    process.exitCode = 1;
  });
}

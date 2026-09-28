// The rating server — a Cloudflare Worker with a D1 database, on the free
// plan.
//
// It exists because a static site cannot rank people automatically: the app
// has nowhere to send a score by itself, and Telegram does not let an app
// send messages on the user's behalf. So every player's app posts its score
// here whenever it changes, and asks here for the board.
//
//   POST /sync   { initData, score }  →  { top, me, ranked, week }
//
// With initData from Telegram, the score is checked, stored under that
// player, and ranked. Without it — someone opening the site in a browser —
// the score is ranked for them but never stored, so the web can look but not
// join.
//
// The body is sent as text/plain, which browsers treat as a simple request:
// no CORS preflight, so one round trip instead of two.
//
// It also hosts the multiplayer game (see room.js):
//
//   POST /game/create  { settings, questions }  →  { code, creatorToken }
//   GET  /game/<code>/ws                         →  the game's WebSocket
//
// And the classrooms (see classroom.js), every call signed by Telegram:
//
//   POST /class/<action>  { initData, …, score?, detail? }
//
// Secrets and bindings (see wrangler.toml and the README):
//   BOT_TOKEN — the bot's token, set as a Worker secret, to check signatures
//   DB        — the D1 database
//   GAMES     — the game rooms, one Durable Object per live game

import { CODE_RE } from "../../src/lib/game.js";
import { checkDetail, checkScore, displayName, playerKey, usernameOf } from "../../src/lib/scorecard.js";
import { savePlayer, serverToday, snapshotCache, standingsFor } from "./board.js";
import { fetchUpload, handleBot, setupBot } from "./bot.js";
import { classAction, servedImage } from "./classroom.js";
import { cleanQuestions, cleanSettings } from "./game.js";
import { verifyInitData } from "./telegram.js";

export { GameRoom } from "./room.js";

// The site, and the local dev server under both of its names (a second name
// lets two "phones" with separate storage be tried side by side).
const ORIGINS = ["https://azizbek-mux.github.io", "http://localhost:5188", "http://[::1]:5188"];
const MAX_BODY = 8192;
// Thirty questions with their explanations come to about 18 KB.
const MAX_GAME_BODY = 48 * 1024;
const MAX_CLASS_BODY = 64 * 1024;
// Bigger for the two calls that carry content: a whole package of questions,
// and one picture (a phone-compressed picture is a few hundred KB as text).
const MAX_CLASS_BODY_FOR = { savepackage: 900 * 1024, image: 520 * 1024 };
const CODE_TRIES = 8;

const snapshot = snapshotCache();

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

/** The whole of /sync, separated from the Worker plumbing so the tests can call it. */
export async function handleSync(request, env, cache = snapshot, now = Date.now()) {
  const text = await request.text();
  if (text.length > MAX_BODY) return { status: 413, body: { error: "too large" } };
  let body;
  try { body = JSON.parse(text); } catch { return { status: 400, body: { error: "not JSON" } }; }

  const today = serverToday(now);
  const checked = body?.score ? checkScore(body.score, today) : null;
  const score = checked?.ok ? checked.score : null;

  // Why a score was not stored, when it was not. The app still gets the
  // board either way — a failed check must not leave someone looking at an
  // error — but the reason is in the reply, so a misconfigured server (a
  // wrong or missing BOT_TOKEN turns every player away) shows up at once in
  // testing instead of as a board that quietly never fills.
  let notStored = null;
  let me = null;
  if (body?.initData) {
    const auth = env.BOT_TOKEN ? await verifyInitData(body.initData, env.BOT_TOKEN, now) : null;
    if (!env.BOT_TOKEN) notStored = "the server has no BOT_TOKEN";
    else if (!auth) notStored = "Telegram data did not verify";
    else {
      me = { key: playerKey(auth.user.id), name: displayName(auth.user), username: usernameOf(auth.user) };
      if (score) {
        // A student in a class also sends accuracy and weak topics.
        const detail = body.detail ? checkDetail(body.detail, score.answered) : null;
        // The stored row, week and all, goes straight into the snapshot, so
        // the sender sees both boards with what they have just done.
        cache.patch(await savePlayer(env.DB, me, score, now, detail));
      } else if (checked) notStored = checked.reason;
    }
  } else if (score) {
    notStored = "not opened from Telegram";
  }

  const players = await cache.get(env.DB, now);
  return {
    status: 200,
    body: { ...standingsFor(players, me, score, today), ...(notStored ? { notStored } : {}) },
  };
}

/** A random six-digit code, never starting with 0 so it reads the same typed or spoken. */
export function randomCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0];
  return String(100000 + (n % 900000));
}

/**
 * A new game: check what the creator's app sent, then find a free code.
 * Each code is its own room, and a room refuses a new game while one is
 * still running there, so trying codes until one accepts cannot collide.
 */
export async function handleCreate(request, env) {
  if (!env.GAMES) return { status: 503, body: { error: "games are not set up" } };
  const text = await request.text();
  if (text.length > MAX_GAME_BODY) return { status: 413, body: { error: "too large" } };
  let body;
  try { body = JSON.parse(text); } catch { return { status: 400, body: { error: "not JSON" } }; }

  const settings = cleanSettings(body?.settings);
  const questions = cleanQuestions(body?.questions);
  if (!settings || !questions) return { status: 400, body: { error: "bad game" } };

  for (let i = 0; i < CODE_TRIES; i++) {
    const code = randomCode();
    const room = env.GAMES.get(env.GAMES.idFromName(code));
    const res = await room.fetch("https://room/init", {
      method: "POST",
      body: JSON.stringify({ code, settings, questions }),
    });
    if (res.status === 409) continue;
    if (!res.ok) return { status: 502, body: { error: "room failed" } };
    const { creatorToken } = await res.json();
    return { status: 200, body: { code, creatorToken } };
  }
  return { status: 503, body: { error: "no free code" } };
}

/**
 * One classroom call. Every one must come from Telegram: a class is people
 * who know each other by name, so nobody takes part without an identity.
 * A call may carry the caller's score and detail too, which keeps what the
 * teacher sees as fresh as the student's last visit to the Class tab.
 */
export async function handleClass(action, request, env, cache = snapshot, now = Date.now()) {
  const text = await request.text();
  if (text.length > (MAX_CLASS_BODY_FOR[action] || MAX_CLASS_BODY)) return { status: 413, body: { error: "too large" } };
  let body;
  try { body = JSON.parse(text); } catch { return { status: 400, body: { error: "not JSON" } }; }
  if (!env.BOT_TOKEN) return { status: 503, body: { error: "no-token" } };
  const auth = body?.initData ? await verifyInitData(body.initData, env.BOT_TOKEN, now) : null;
  if (!auth) return { status: 401, body: { error: "telegram" } };
  const me = { key: playerKey(auth.user.id), name: displayName(auth.user), username: usernameOf(auth.user) };

  const checked = body.score ? checkScore(body.score, serverToday(now)) : null;
  if (checked?.ok) {
    const detail = body.detail ? checkDetail(body.detail, checked.score.answered) : null;
    cache.patch(await savePlayer(env.DB, me, checked.score, now, detail));
  }
  // A question file sent to the bot, handed back to its sender as a stream.
  if (action === "fetchfile") return fetchUpload(env, me, body.token, now);
  const players = action === "view" ? await cache.get(env.DB, now) : undefined;
  return classAction(action, { db: env.DB, me, body, now, players });
}

export default {
  async fetch(request, env, ctx) {
    const headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const { pathname } = new URL(request.url);

    if (pathname === "/game/create" && request.method === "POST") {
      try {
        const { status, body } = await handleCreate(request, env);
        return json(body, status, headers);
      } catch (err) {
        return json({ error: "server error", kind: err?.name || "Error" }, 500, headers);
      }
    }
    // The bot: Telegram's webhook, and the one-time setup that points it here.
    if (pathname === "/bot" && request.method === "POST") {
      try { return await handleBot(request, env, Date.now(), ctx); } catch { return new Response("ok"); }
    }
    if (pathname === "/bot/setup" && request.method === "POST") {
      const { status, body } = await setupBot(request, env);
      return json(body, status, headers);
    }
    // A class picture, as an <img> asks for it: no Telegram data can ride
    // along, so the unguessable id is the key. Never changes, so cached for good.
    const img = /^\/class\/img\/([0-9a-f]{16,40})$/.exec(pathname);
    if (img && request.method === "GET") {
      const found = await servedImage(env.DB, img[1]);
      if (!found) return new Response("not found", { status: 404, headers });
      return new Response(found.bytes, {
        headers: { ...headers, "content-type": found.mime, "cache-control": "public, max-age=31536000, immutable" },
      });
    }
    const cls = /^\/class\/([a-z]+)$/.exec(pathname);
    if (cls && request.method === "POST") {
      try {
        const { status, body, response } = await handleClass(cls[1], request, env);
        if (response) {
          for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
          return response;
        }
        return json(body, status, headers);
      } catch (err) {
        return json({ error: "server error", kind: err?.name || "Error" }, 500, headers);
      }
    }
    const ws = /^\/game\/(\d{6})\/ws$/.exec(pathname);
    if (ws && CODE_RE.test(ws[1])) {
      if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected a WebSocket" }, 426, headers);
      if (!env.GAMES) return json({ error: "games are not set up" }, 503, headers);
      return env.GAMES.get(env.GAMES.idFromName(ws[1])).fetch(request);
    }
    if (pathname === "/sync" && request.method === "POST") {
      try {
        const { status, body } = await handleSync(request, env);
        return json(body, status, headers);
      } catch (err) {
        // The message can mention SQL, never the token; still, keep it short.
        return json({ error: "server error", kind: err?.name || "Error" }, 500, headers);
      }
    }
    if (pathname === "/" || pathname === "/health") {
      return json({ ok: true, service: "usmleengo rating" }, 200, headers);
    }
    return json({ error: "not found" }, 404, headers);
  },
};

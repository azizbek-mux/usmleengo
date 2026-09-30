// Talking to a multiplayer game on the server (worker/src/room.js).
//
// A game is created with one request, then every phone in it — the
// creator's too — holds a WebSocket open to the game's room for as long as
// it plays. The room sends the whole game as that phone should see it
// whenever anything changes; the phone sends only its own moves.

import { scoped } from "./account.js";
import { lang } from "./i18n.js";
import { RATING_API } from "./ratingApi.js";
import { initData } from "./telegram.js";

const SEATS_KEY = "usmle_game_seats";
const SEAT_DAYS = 1;

/**
 * This phone's seat in each game it has been in: a random id that lets it
 * back in as the same player after a dropped connection, and for the
 * creator, the token that makes them host. Nothing about the games
 * themselves is kept — a seat is forgotten after a day.
 */
function readSeats() {
  try {
    const all = JSON.parse(localStorage.getItem(scoped(SEATS_KEY)) || "{}");
    const cutoff = Date.now() - SEAT_DAYS * 86400000;
    return Object.fromEntries(Object.entries(all).filter(([, s]) => s?.at > cutoff));
  } catch {
    return {};
  }
}

function writeSeats(seats) {
  try { localStorage.setItem(scoped(SEATS_KEY), JSON.stringify(seats)); } catch { /* a seat is a convenience */ }
}

function randomId() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function seatFor(code, extra = {}) {
  const seats = readSeats();
  seats[code] = { clientId: randomId(), ...seats[code], ...extra, at: Date.now() };
  writeSeats(seats);
  return seats[code];
}

/** Create a game on the server. Resolves to its six-digit code. */
export async function createGame(settings, questions) {
  const res = await fetch(`${RATING_API}/game/create`, {
    method: "POST",
    // text/plain, as for the rating: no CORS preflight.
    headers: { "content-type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({ settings, questions }),
  });
  if (!res.ok) throw new Error(`create failed: ${res.status}`);
  const { code, creatorToken } = await res.json();
  seatFor(code, { creatorToken });
  return code;
}

const RETRIES = 8;
const PING_MS = 25000;

/**
 * Join a game and stay in it.
 *
 *   onState(state)   — the game, whenever it changes
 *   onStatus(status) — "connecting" | "open" | "reconnecting"
 *   onError(reason)  — the room refused this phone ("missing", "started",
 *                      "full", "closed") or the connection could not be
 *                      brought back ("offline"); nothing more will come
 *   onNotice(reason) — a move was refused, e.g. a guest pressing Start
 *
 * Returns { send(message), close(leave) }.
 */
export function connectGame(code, { nickname, onState, onStatus, onError, onNotice }) {
  const seat = seatFor(code);
  const url = `${RATING_API.replace(/^http/, "ws")}/game/${code}/ws`;
  let ws = null;
  let done = false;
  let attempts = 0;
  let retry = null;

  function open() {
    if (done) return;
    onStatus?.(attempts ? "reconnecting" : "connecting");
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      attempts = 0;
      sock.send(JSON.stringify({
        type: "join",
        clientId: seat.clientId,
        creatorToken: seat.creatorToken,
        initData: initData() || undefined,
        nickname,
        // Sent on every join, so the room can put each question to this
        // phone in the language its owner reads.
        lang: lang(),
      }));
      onStatus?.("open");
    };
    sock.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; } // "pong"
      if (msg.type === "state") onState?.(msg);
      else if (msg.type === "notice") onNotice?.(msg.reason);
      else if (msg.type === "error") {
        done = true;
        onError?.(msg.reason);
      }
    };
    sock.onclose = () => {
      // A socket already replaced by a newer one closing late changes nothing.
      if (done || sock !== ws) return;
      if (attempts >= RETRIES) {
        done = true;
        onError?.("offline");
        return;
      }
      attempts++;
      onStatus?.("reconnecting");
      retry = setTimeout(open, Math.min(8000, 400 * 2 ** attempts));
    };
  }

  // Coming back to the app after a phone call: reconnect at once rather
  // than wait out the back-off.
  const onVisible = () => {
    if (document.hidden || done || !ws || ws.readyState <= 1) return;
    clearTimeout(retry);
    open();
  };
  const ping = setInterval(() => { if (ws?.readyState === 1) ws.send("ping"); }, PING_MS);
  document.addEventListener("visibilitychange", onVisible);
  open();

  return {
    send(message) {
      if (ws?.readyState !== 1) return false;
      ws.send(JSON.stringify(message));
      return true;
    },
    close(leave = false) {
      done = true;
      clearInterval(ping);
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        if (leave && ws?.readyState === 1) ws.send(JSON.stringify({ type: "leave" }));
        ws?.close();
      } catch { /* already closed */ }
    },
  };
}

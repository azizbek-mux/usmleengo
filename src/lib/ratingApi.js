// Talking to the rating server (worker/).
//
// Every player is on the board from the first time they open the app: the
// app sends its score, with Telegram's signed launch data to prove who it is,
// and the server stores and ranks it. Nobody has to join.
//
// Two kinds of call, one endpoint:
//   - quietSync(): after a round, a study session, or on opening the app —
//     sends the score only if it changed, and keeps the reply for later.
//   - syncRating(): the rating screens, once a minute while open, to show
//     the latest board.

import { ratingInput } from "./storage.js";
import { initData } from "./telegram.js";

/**
 * Where the rating server lives. Set once, when it is first deployed. A local
 * server can be used instead during development by putting
 * VITE_RATING_API=http://localhost:8787 in .env.local.
 */
export const RATING_API = import.meta.env?.VITE_RATING_API || "https://usmleengo-rating.REPLACE_ME.workers.dev";

const SENT_KEY = "usmle_rating_sent";
// Even an unchanged score is re-sent after this long, so a player's name and
// username on the board follow any change they make on Telegram.
const RESEND_MS = 6 * 3600000;

/**
 * Send the current score and get the board back, or null if the server
 * could not be reached. Never throws — the rating is extra, and nothing about
 * studying may wait on it or fail because of it.
 */
export async function syncRating(state) {
  try {
    const res = await fetch(`${RATING_API}/sync`, {
      method: "POST",
      // text/plain keeps this a "simple" request: no CORS preflight, so one
      // round trip instead of two on a phone connection.
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ initData: initData() || undefined, score: ratingInput(state) }),
    });
    if (!res.ok) return null;
    const reply = await res.json();
    if (reply?.ranked) remember(state);
    return reply;
  } catch {
    return null;
  }
}

const signature = (state) => JSON.stringify(ratingInput(state));

function remember(state) {
  try { localStorage.setItem(SENT_KEY, JSON.stringify({ sig: signature(state), at: Date.now() })); } catch { /* cosmetic */ }
}

/**
 * Keep the server up to date without being asked: only from Telegram (a
 * browser visitor is never stored anyway), and only when the score changed
 * or has not been sent for a while.
 */
export function quietSync(state) {
  if (!initData()) return Promise.resolve(null);
  let last = null;
  try { last = JSON.parse(localStorage.getItem(SENT_KEY) || "null"); } catch { /* treat as never sent */ }
  if (last && last.sig === signature(state) && Date.now() - last.at < RESEND_MS) return Promise.resolve(null);
  return syncRating(state);
}

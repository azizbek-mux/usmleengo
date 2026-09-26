// The published leaderboard, fetched at runtime.
//
// Built every half hour by tools/fetch-leaderboard.mjs from scores players
// sent to the bot. Fetched rather than bundled, for the same reason as the
// question bank: it changes on its own schedule, and the app should pick up
// a new board without a new app.

import { sanitizeBoard } from "../lib/scorecard.js";

/**
 * The board, or null when there is none to show.
 *
 * "None to show" covers a dev server with no file, a first deploy before any
 * scores exist, and a network failure. None of them is an error the user can
 * do anything about, and the rating screen works without a board — it just
 * has nobody to rank against — so this never throws.
 */
export async function loadLeaderboard() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}leaderboard.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const board = sanitizeBoard(await res.json());
    return {
      updatedAt: board.updatedAt,
      players: Object.entries(board.players).map(([key, p]) => ({ key, ...p })),
    };
  } catch {
    return null;
  }
}

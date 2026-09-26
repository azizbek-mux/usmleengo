import React, { useEffect, useMemo, useState } from "react";
import {
  BOARDS, FREE_SECONDS, POINTS_MAX, WEIGHTS, dayIndex, formatPace, points, rate, standings,
} from "../lib/rating.js";
import { displayName, encodeScore, leavePayload, playerKey, usernameOf } from "../lib/scorecard.js";
import { ratingInput, today } from "../lib/storage.js";
import { BOT_LINK, haptic, inTelegram, openTelegram, telegramUser, userId } from "../lib/telegram.js";
import { Trophy } from "./Icons.jsx";

const TOP = 10;
const SENT_KEY = "usmle_rating_sent";

/**
 * Everything the rating and performance screens need, from the viewer's live
 * state and the published board, scored with the one algorithm in rating.js.
 *
 *   me       — the viewer, rated on their live numbers
 *   players  — everyone on the board, rated the same way
 *   boards   — standings on each of the four boards, viewer folded in
 *   onBoard  — the viewer's published entry, if they have joined
 */
export function ratingData(state, board) {
  const todayIdx = dayIndex(today());
  const key = playerKey(userId());
  const profile = telegramUser();
  const input = ratingInput(state);

  const me = {
    key: key || "__me",
    name: profile ? displayName(profile) : "You",
    username: profile ? usernameOf(profile) : null,
    rating: rate(input, todayIdx),
  };
  const players = (board?.players || []).map((p) => ({
    key: p.key, name: p.name, username: p.username || null, sentAt: p.sentAt, raw: p,
    rating: rate(p, todayIdx),
  }));
  const boards = {};
  for (const b of BOARDS) boards[b.id] = standings(b.id, players, me);

  return {
    me, players, boards, input,
    onBoard: key ? players.find((p) => p.key === key) || null : null,
    others: boards.overall.total - 1,
  };
}

/** How a row's value reads on each board. */
export function valueOf(board, rating) {
  if (board === "streak") return String(rating.raw.streak);
  if (board === "xp") return rating.raw.xp.toLocaleString();
  if (board === "speed") return formatPace(rating.raw.pace);
  return String(points(rating.overall));
}

function readSent() {
  try { return Number(localStorage.getItem(SENT_KEY)) || 0; } catch { return 0; }
}
function writeSent(ms) {
  try { localStorage.setItem(SENT_KEY, String(ms)); } catch { /* cosmetic */ }
}

function Row({ row, board }) {
  return (
    <div className={`board-row${row.isMe ? " me" : ""}${row.place <= 3 ? ` p${row.place}` : ""}`}>
      <span className="board-place">{row.place}</span>
      <span className="board-who">
        <span className="board-name">
          {row.name}
          {/* Beside a real name only — outside Telegram the name is already "You". */}
          {row.isMe && row.name !== "You" && <span className="board-you">you</span>}
        </span>
        {row.username && <span className="board-user">@{row.username}</span>}
      </span>
      <span className="board-value">{valueOf(board, row.rating)}</span>
    </div>
  );
}

/** The leaderboard: the top ten on whichever board the filter is set to. */
export default function Rating({ state, board, boardLoading, onRefresh, onBack }) {
  const [tab, setTab] = useState("overall");
  const [sent, setSent] = useState(readSent);

  // Always look at the newest board when the screen opens.
  useEffect(() => { onRefresh?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => ratingData(state, board), [state, board]);
  const { me, onBoard, others, input } = data;
  const current = data.boards[tab];
  const top = current.rows.slice(0, TOP);
  const meBelow = current.me && current.me.place > TOP ? current.me : null;
  const column = BOARDS.find((b) => b.id === tab).column;

  const joined = Boolean(onBoard);
  const myKey = me.key !== "__me" ? me.key : null;

  // A score sent in the last few hours that the board has not caught up with.
  const pending = sent > Date.now() - 3 * 3600000 &&
    (!onBoard || onBoard.sentAt * 1000 < sent - 60000);

  // Has the viewer moved on since the score the board holds?
  const stale = onBoard && (
    onBoard.raw.xp !== input.xp || onBoard.raw.streak !== input.streak ||
    onBoard.raw.lastDay !== input.lastDay || onBoard.raw.answered !== input.answered
  );

  function send(payload) {
    haptic("medium");
    const now = Date.now();
    writeSent(now);
    setSent(now);
    openTelegram(`${BOT_LINK}?start=${payload}`);
  }
  const join = () => {
    const payload = encodeScore(input);
    if (payload) send(payload);
  };
  const leave = () => {
    haptic("light");
    writeSent(0);
    setSent(0);
    openTelegram(`${BOT_LINK}?start=${leavePayload()}`);
  };

  const myPlace = data.boards.overall.me;
  let placeLine;
  if (!others) placeLine = "Nobody else on the board yet";
  else if (joined) placeLine = `You are #${myPlace.place} out of ${data.boards.overall.total}`;
  else placeLine = `You would be #${myPlace.place} out of ${data.boards.overall.total}`;

  return (
    <div className="screen rating">
      <div className="rating-top">
        <button className="back-link" onClick={() => { haptic("light"); onBack(); }}>‹ Back</button>
        <span className="rating-title">Rating</span>
        <span className="rating-spacer" />
      </div>

      <div className="rating-place">
        <span>{placeLine}</span>
        <b>{points(me.rating.overall)} <small>pts</small></b>
      </div>

      {/* ── filter ────────────────────────────────────────────────────────── */}
      <div className="rating-tabs" role="tablist" aria-label="Filter">
        {BOARDS.map((b) => (
          <button
            key={b.id}
            role="tab"
            aria-selected={tab === b.id}
            className={`rating-tab${tab === b.id ? " on" : ""}`}
            onClick={() => { haptic("light"); setTab(b.id); }}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* ── the table ─────────────────────────────────────────────────────── */}
      <div className="board">
        <div className="board-head">
          <span className="board-place">Rank</span>
          <span className="board-who">Name</span>
          <span className="board-value">{column}</span>
        </div>
        {top.map((r) => <Row key={r.key} row={r} board={tab} />)}
        {meBelow && (
          <>
            <div className="board-gap" aria-hidden="true">⋯</div>
            <Row row={meBelow} board={tab} />
          </>
        )}
        {!current.total && (
          <div className="board-empty">
            {tab === "speed"
              ? "Answer a few questions correctly and your time appears here."
              : "Nothing to rank yet."}
          </div>
        )}
        {boardLoading && !board && <div className="board-empty">Loading the board…</div>}
      </div>

      {/* ── joining ───────────────────────────────────────────────────────── */}
      <div className="rating-join">
        {!inTelegram || !myKey ? (
          <div className="cta-note">Open usmleengo inside Telegram to put yourself on the board.</div>
        ) : pending ? (
          <div className="rating-sent">
            <b>Sent.</b> You go up on the board within about half an hour.
          </div>
        ) : joined ? (
          <>
            {stale && <button className="btn btn-primary" onClick={join}>Send my new points</button>}
            <div className="cta-note">
              {stale ? "Your numbers have moved since you last sent them." : "You are on the board with your latest points."}
              {" "}
              <button className="text-link" onClick={leave}>Take me off the board</button>
            </div>
          </>
        ) : (
          <>
            <button className="btn btn-primary btn-icon" onClick={join}>
              <Trophy size={18} /> Put me on the board
            </button>
            <div className="cta-note">
              Opens the bot — press Start to send your points. Your Telegram name
              and username become visible on the board.
            </div>
          </>
        )}
      </div>

      <details className="rating-how">
        <summary>How points are counted</summary>
        <p>
          Points, out of {POINTS_MAX}, mix three things: <b>day streak</b> counts most
          ({Math.round(WEIGHTS.streak * 100)}%), then <b>XP</b> ({Math.round(WEIGHTS.xp * 100)}%),
          then <b>average time</b> ({Math.round(WEIGHTS.speed * 100)}%).
        </p>
        <p>
          Only correct answers are timed, so guessing fast never helps. Typing gets
          more time than tapping — {FREE_SECONDS.gap}s against {FREE_SECONDS.binary}s — so
          choosing the harder format never costs you points.
        </p>
        <p>
          Each part levels off as it grows, so the top stays within reach of someone
          who started this month. A streak only counts while it is alive: miss two
          days and it is back to zero.
        </p>
      </details>
    </div>
  );
}

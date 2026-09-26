import React, { useEffect, useMemo, useState } from "react";
import {
  BOARDS, WEIGHTS, XP, FREE_SECONDS, dayIndex, formatPace, rate, standings,
} from "../lib/rating.js";
import { encodeScore, leavePayload, playerKey } from "../lib/scorecard.js";
import { ratingInput, today } from "../lib/storage.js";
import { BOT_LINK, haptic, inTelegram, openTelegram, userId } from "../lib/telegram.js";

const TOP = 10;
const SENT_KEY = "usmle_rating_sent";

/** A trophy, drawn to sit with the other line icons. */
export function Trophy({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
    </svg>
  );
}

/**
 * The one line Home shows about the rating: the overall score, and a place
 * if there is anyone to be placed against. Computed with the same code as the
 * screen itself, so the two can never disagree.
 */
export function ratingSummary(state, board) {
  const todayIdx = dayIndex(today());
  const key = playerKey(userId());
  const me = { key: key || "__me", name: "You", rating: rate(ratingInput(state), todayIdx) };
  const players = (board?.players || []).map((p) => ({ key: p.key, name: p.name, rating: rate(p, todayIdx) }));
  const s = standings("overall", players, me);
  return {
    score: Math.round(me.rating.overall),
    place: s.me?.place ?? null,
    total: s.total,
    others: s.total - 1,
  };
}

/** How a row's value reads on each board. */
function valueOf(board, rating) {
  if (board === "streak") return `${rating.raw.streak} ${rating.raw.streak === 1 ? "day" : "days"}`;
  if (board === "xp") return rating.raw.xp.toLocaleString();
  if (board === "speed") return formatPace(rating.raw.pace);
  return Math.round(rating.overall);
}

/** "#3" — or a dash when there is nothing to place. */
const place = (row) => (row?.place ? `#${row.place}` : "—");

function readSent() {
  try { return Number(localStorage.getItem(SENT_KEY)) || 0; } catch { return 0; }
}
function writeSent(ms) {
  try { localStorage.setItem(SENT_KEY, String(ms)); } catch { /* cosmetic */ }
}

/**
 * The rating section.
 *
 * Everything on it is computed here from raw numbers — the viewer's own live
 * state, and whatever the published board holds for everyone else — with the
 * same rating.js the whole way through.
 */
export default function Rating({ state, board, boardLoading, onRefresh, onBack }) {
  const [tab, setTab] = useState("overall");
  const [sent, setSent] = useState(readSent);

  // Always look at the newest board when the screen opens.
  useEffect(() => { onRefresh?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayIdx = dayIndex(today());
  const myKey = playerKey(userId());
  const input = ratingInput(state);

  const me = useMemo(
    () => ({ key: myKey || "__me", name: "You", rating: rate(input, todayIdx) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.xp, state.streak, state.lastDay, state.timing, myKey, todayIdx],
  );

  const players = useMemo(
    () => (board?.players || []).map((p) => ({ key: p.key, name: p.name, sentAt: p.sentAt, raw: p, rating: rate(p, todayIdx) })),
    [board, todayIdx],
  );

  const onBoard = myKey ? players.find((p) => p.key === myKey) : null;
  const joined = Boolean(onBoard);

  // Every board at once: the tiles need a place on each.
  const all = useMemo(() => {
    const out = {};
    for (const b of BOARDS) out[b.id] = standings(b.id, players, me);
    return out;
  }, [players, me]);

  const current = all[tab];
  const top = current.rows.slice(0, TOP);
  const meBelow = current.me && current.me.place > TOP ? current.me : null;
  const others = current.total - (current.me ? 1 : 0);

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

  let headline;
  if (!others) headline = "Nobody else on the board yet";
  else if (joined) headline = `You are #${all.overall.me.place} out of ${all.overall.total}`;
  else headline = `You would be #${all.overall.me.place} out of ${all.overall.total}`;

  const tiles = [
    { id: "streak", label: "Day streak", value: valueOf("streak", me.rating) },
    { id: "xp", label: "XP", value: valueOf("xp", me.rating) },
    {
      id: "speed", label: "Avg. time",
      value: me.rating.speed === null ? "—" : valueOf("speed", me.rating),
    },
  ];

  return (
    <div className="screen rating">
      <div className="rating-top">
        <button className="back-link" onClick={() => { haptic("light"); onBack(); }}>‹ Home</button>
        <span className="rating-title">Rating</span>
        <span className="rating-spacer" />
      </div>

      {/* ── the viewer, at a glance ───────────────────────────────────────── */}
      <div className="rating-hero">
        <div className="rating-hero-l">Your rating</div>
        <div className="rating-score">
          {Math.round(me.rating.overall)}<span>/100</span>
        </div>
        <div className="rating-rank">{headline}</div>
      </div>

      <div className="rating-tiles">
        {tiles.map((t) => (
          <button
            key={t.id}
            className={`rating-tile${tab === t.id ? " on" : ""}`}
            onClick={() => { haptic("light"); setTab(t.id); }}
          >
            <b>{t.value}</b>
            <span>{t.label}</span>
            <em>{others ? place(all[t.id].me) : " "}</em>
          </button>
        ))}
      </div>

      {/* ── the boards ────────────────────────────────────────────────────── */}
      <div className="rating-tabs" role="tablist">
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
      <div className="rating-note">{BOARDS.find((b) => b.id === tab).note}</div>

      <div className="board">
        {top.map((r) => (
          <div key={r.key} className={`board-row${r.isMe ? " me" : ""}${r.place <= 3 ? ` p${r.place}` : ""}`}>
            <span className="board-place">{r.place}</span>
            <span className="board-name">{r.isMe ? "You" : r.name}</span>
            <span className="board-value">{valueOf(tab, r.rating)}</span>
          </div>
        ))}
        {meBelow && (
          <>
            <div className="board-gap" aria-hidden="true">⋯</div>
            <div className="board-row me">
              <span className="board-place">{meBelow.place}</span>
              <span className="board-name">You</span>
              <span className="board-value">{valueOf(tab, meBelow.rating)}</span>
            </div>
          </>
        )}
        {!current.total && (
          <div className="board-empty">
            {tab === "speed"
              ? "Answer a few questions correctly and your speed appears here."
              : "Nothing to rank yet."}
          </div>
        )}
        {boardLoading && !board && <div className="board-empty">Loading the board…</div>}
      </div>

      {/* ── joining ───────────────────────────────────────────────────────── */}
      <div className="rating-join">
        {!inTelegram || !myKey ? (
          <div className="cta-note">
            Open usmleengo inside Telegram to put yourself on the board.
          </div>
        ) : pending ? (
          <div className="rating-sent">
            <b>Sent.</b> You go up on the board within about half an hour — the
            board is rebuilt twice an hour.
          </div>
        ) : joined ? (
          <>
            {stale && (
              <button className="btn btn-primary" onClick={join}>Send my new score</button>
            )}
            <div className="cta-note">
              {stale
                ? "Your numbers have moved since you last sent them."
                : "You are on the board, and it has your latest score."}
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
              Opens the bot — press Start to send your score. Your first name,
              last initial and these numbers become public on the board.
            </div>
          </>
        )}
      </div>

      {/* ── the rules, in plain words ─────────────────────────────────────── */}
      <div className="rating-how">
        <div className="section-label">How the rating works</div>
        <p>
          Your rating mixes three things. <b>Day streak</b> counts most ({Math.round(WEIGHTS.streak * 100)}%),
          then <b>XP</b> ({Math.round(WEIGHTS.xp * 100)}%), then <b>speed</b> ({Math.round(WEIGHTS.speed * 100)}%).
          Turning up every day beats a single long session.
        </p>
        <p>
          A typed answer earns <b>{XP.gapCorrect} XP</b>, a tapped one <b>{XP.binaryCorrect}</b>, and a
          wrong one still earns {XP.wrong}.
        </p>
        <p>
          Only correct answers are timed, so guessing fast never helps. The Speed
          board is a plain stopwatch. Inside your rating, though, typing gets more
          time: anything under {FREE_SECONDS.binary}s tapped or {FREE_SECONDS.gap}s typed counts as full
          speed, so choosing the harder format never costs you.
        </p>
        <p>
          Each part levels off as it grows, so first place stays within reach of
          someone who started this month. A streak only counts while it is alive:
          miss two days and it is back to zero.
        </p>
      </div>
    </div>
  );
}

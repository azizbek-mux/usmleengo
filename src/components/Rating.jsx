import React, { useEffect, useMemo, useState } from "react";
import {
  BOARDS, FREE_SECONDS, POINTS_MAX, WEIGHTS, dayIndex, formatPace, medalFor, points, rate,
} from "../lib/rating.js";
import { displayName, usernameOf } from "../lib/scorecard.js";
import { ratingInput, today } from "../lib/storage.js";
import { haptic, telegramUser } from "../lib/telegram.js";
import { ScreenHead } from "./Chrome.jsx";

const TOP = 10;

/**
 * What the rating and performance screens show.
 *
 *   me      — the viewer: their Telegram name, and their points computed here
 *             with the same rating.js the server ranks on
 *   top     — the server's top ten on each board, or null before it answers
 *   places  — the viewer's { place, total } on each board, from the server
 *   ranked  — whether the viewer is on the board (always, inside Telegram)
 *   week    — this week's board from the server: { top, me, endsAt }
 */
export function ratingData(state, standings) {
  const profile = telegramUser();
  const input = ratingInput(state);
  return {
    me: {
      name: profile ? displayName(profile) : "You",
      username: profile ? usernameOf(profile) : null,
      rating: rate(input, dayIndex(today())),
    },
    input,
    top: standings?.top || null,
    places: standings?.me || null,
    ranked: Boolean(standings?.ranked),
    week: standings?.week || null,
  };
}

/** How a row's value reads on each board. Rows carry { points, raw }. */
export function valueOf(board, row) {
  if (board === "streak") return String(row.raw.streak);
  if (board === "xp") return row.raw.xp.toLocaleString();
  if (board === "speed") return formatPace(row.raw.pace);
  return String(row.points);
}

/** "#88 / 2,300". */
export const rankText = (p) => (p?.place ? `#${p.place} / ${p.total.toLocaleString()}` : "—");

/**
 * Keep the board fresh while a screen that shows it is open: once a minute,
 * and straight away on coming back to the app. Nothing is fetched while the
 * app is in the background, and leaving the screen stops it.
 */
export const REFRESH_MS = 60000;

export function useLiveBoard(onRefresh) {
  useEffect(() => {
    if (!onRefresh) return undefined;
    onRefresh();
    const tick = () => { if (!document.hidden) onRefresh(); };
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The rating is points, and only points: that is the rank. Day streak, XP
 * and time are filters — they re-sort the same people by one part of the
 * points, to see who leads it, but a place there is not a rank.
 */
const FILTERS = BOARDS.filter((b) => b.id !== "overall");
const FILTERED_BY = { streak: "day streak", xp: "XP", speed: "time" };

/**
 * A place in the Rank column: the medal for the top three on the rating,
 * the number for everyone else — and for everyone on a filter, where a first
 * place has not won anything.
 */
export function PlaceMark({ place, medal = true }) {
  const m = medal ? medalFor(place) : null;
  return m ? <span className="board-medal" role="img" aria-label={`Place ${place}`}>{m}</span> : place;
}

function Row({ row, board, me }) {
  // The server never sends the viewer's own name back; it is filled in here.
  const name = row.isMe ? me.name : row.name;
  const username = row.isMe ? me.username : row.username;
  // Gold and silver are for the rating. A filter's first place has not won
  // anything.
  const medal = board === "overall" && row.place <= 3 ? ` p${row.place}` : "";
  return (
    <div className={`board-row${row.isMe ? " me" : ""}${medal}`}>
      <span className="board-place"><PlaceMark place={row.place} medal={Boolean(medal)} /></span>
      <span className="board-who">
        <span className="board-name">
          {name}
          {/* Beside a real name only — outside Telegram the name is already "You". */}
          {row.isMe && name !== "You" && <span className="board-you">you</span>}
        </span>
        {username && <span className="board-user">@{username}</span>}
      </span>
      <span className="board-value">{valueOf(board, row)}</span>
    </div>
  );
}

/** "Resets in 3 days", "Resets tomorrow", "Resets in 5 h". */
function resetsIn(endsAt, now = Date.now()) {
  const ms = endsAt - now;
  if (!(ms > 0)) return "Resets now";
  const hours = Math.ceil(ms / 3600000);
  if (hours < 24) return `Resets in ${hours} h`;
  const days = Math.ceil(ms / 86400000);
  return days === 1 ? "Resets tomorrow" : `Resets in ${days} days`;
}

/** The rating: the top ten by points, or by one part of them while a filter is on. */
export default function Rating({ state, standings, loading, onRefresh }) {
  // All time or this week. Both rank by points.
  const [period, setPeriod] = useState("all");
  // null is the rating itself.
  const [filter, setFilter] = useState(null);
  const board = filter || "overall";
  useLiveBoard(onRefresh);

  const { me, top, places, ranked, week } = useMemo(() => ratingData(state, standings), [state, standings]);
  const rows = top?.[board] || [];
  const mine = places?.[board];
  const column = BOARDS.find((b) => b.id === board).column;

  function choose(id) {
    haptic("light");
    setFilter((f) => (f === id ? null : id));
  }

  // Below the top ten, the viewer still sees their own row, after a gap.
  const meBelow = mine?.place > TOP
    ? { place: mine.place, isMe: true, points: points(me.rating.overall), raw: me.rating.raw }
    : null;

  let placeLine;
  if (!standings) {
    placeLine = <span>{loading ? "Loading the rating…" : "The rating cannot be reached right now"}</span>;
  } else if (places.overall.total <= 1) {
    placeLine = <span>You are the first on the board</span>;
  } else {
    placeLine = (
      <span className="rating-rank">
        {medalFor(places.overall.place) && `${medalFor(places.overall.place)} `}
        {ranked ? "Your rank" : "You would be"} <b>{rankText(places.overall)}</b>
      </span>
    );
  }

  const periods = (
    <div className="period" role="tablist" aria-label="Period">
      {[["all", "All time"], ["week", "This week"]].map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={period === id}
          className={`period-opt${period === id ? " on" : ""}`}
          onClick={() => { if (period !== id) { haptic("light"); setPeriod(id); } }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (period === "week") {
    return (
      <div className="screen rating">
        <ScreenHead title="Rating" sub="Everyone who plays, ranked by points" />
        {periods}
        <WeekBoard week={week} me={me} ranked={ranked} standings={standings} loading={loading} />
      </div>
    );
  }

  return (
    <div className="screen rating">
      <ScreenHead title="Rating" sub="Everyone who plays, ranked by points" />
      {periods}

      <div className="rating-place">
        {placeLine}
        <b>{points(me.rating.overall)} <small>pts</small></b>
      </div>

      {/* ── filter ────────────────────────────────────────────────────────── */}
      <div className="rating-filter" role="group" aria-label="Filter">
        <span className="rating-filter-l">Filter</span>
        {FILTERS.map((b) => (
          <button
            key={b.id}
            aria-pressed={filter === b.id}
            className={`chip${filter === b.id ? " on" : ""}`}
            onClick={() => choose(b.id)}
          >
            {b.name}
            {filter === b.id && <span className="chip-x" aria-hidden="true">×</span>}
          </button>
        ))}
      </div>

      {/* ── the table ─────────────────────────────────────────────────────── */}
      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>
          {filter ? `Filtered by ${FILTERED_BY[filter]} · not the rating` : "Rating · by points"}
        </span>
        {filter && (
          <button className="chips-clear" onClick={() => { haptic("light"); setFilter(null); }}>
            Show rating
          </button>
        )}
      </div>
      <div className="board">
        <div className="board-head">
          {/* Only the rating has ranks; a filter just numbers its order. */}
          <span className="board-place">{filter ? "#" : "Rank"}</span>
          <span className="board-who">Name</span>
          <span className="board-value">{column}</span>
        </div>
        {rows.map((r) => <Row key={`${r.place}-${r.isMe ? "me" : r.name}-${r.username || ""}`} row={r} board={board} me={me} />)}
        {meBelow && (
          <>
            <div className="board-gap" aria-hidden="true">⋯</div>
            <Row row={meBelow} board={board} me={me} />
          </>
        )}
        {standings && !rows.length && (
          <div className="board-empty">
            {board === "speed"
              ? "Answer a few questions correctly and your time appears here."
              : "Nothing to rank yet."}
          </div>
        )}
        {!standings && <div className="board-empty">{loading ? "Loading…" : "Try again in a moment."}</div>}
      </div>

      {standings && !ranked && (
        <div className="cta-note rating-web">Open usmleengo in Telegram to be ranked.</div>
      )}

      <details className="rating-how">
        <summary>How points are counted</summary>
        <p>
          Everyone who uses usmleengo is ranked, automatically, and places update
          within a minute. The top ten are shown by their Telegram name and
          username; everyone else sees only their own place.
        </p>
        <p>
          <b>Your rank is by points alone.</b> The day streak, XP and time filters
          only show who leads each part of the points — they are not ranks.
        </p>
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

/**
 * This week: the same points, counted from Monday — days studied this week in
 * place of the streak, this week's XP, this week's time — so everyone starts
 * level each Monday and a newcomer can win a week. The top ten, the viewer's
 * own place, and when it starts over.
 */
function WeekBoard({ week, me, ranked, standings, loading }) {
  const rows = week?.top || [];
  const mine = week?.me;
  const meBelow = mine?.place > TOP ? { place: mine.place, isMe: true, points: mine.points, raw: mine.raw } : null;

  let placeLine;
  if (!standings) {
    placeLine = <span>{loading ? "Loading the rating…" : "The rating cannot be reached right now"}</span>;
  } else if (!ranked) {
    placeLine = <span>Open usmleengo in Telegram to be ranked</span>;
  } else if (!mine?.place) {
    placeLine = <span>Study today to join this week’s board</span>;
  } else {
    placeLine = (
      <span className="rating-rank">
        {medalFor(mine.place) && `${medalFor(mine.place)} `}
        This week <b>{rankText(mine)}</b>
      </span>
    );
  }

  return (
    <>
      <div className="rating-place">
        {placeLine}
        {mine?.place ? <b>{mine.points} <small>pts</small></b> : null}
      </div>

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>This week · by points</span>
        {week?.endsAt && <span className="game-count">{resetsIn(week.endsAt)}</span>}
      </div>
      <div className="board">
        <div className="board-head">
          <span className="board-place">Rank</span>
          <span className="board-who">Name</span>
          <span className="board-value">Points</span>
        </div>
        {rows.map((r) => <Row key={`${r.place}-${r.isMe ? "me" : r.name}-${r.username || ""}`} row={r} board="overall" me={me} />)}
        {meBelow && (
          <>
            <div className="board-gap" aria-hidden="true">⋯</div>
            <Row row={meBelow} board="overall" me={me} />
          </>
        )}
        {standings && !rows.length && (
          <div className="board-empty">Nobody has studied yet this week. The first round puts you on top.</div>
        )}
        {!standings && <div className="board-empty">{loading ? "Loading…" : "Try again in a moment."}</div>}
      </div>

      <details className="rating-how">
        <summary>How this week is counted</summary>
        <p>
          The same points as the rating, from this week alone: the <b>days you study</b> between
          Monday and Sunday count most, then the <b>XP</b> you earn this week, then your
          <b> average time</b> this week. Everyone starts level on Monday, so a week can be won
          by anyone — however long they have been playing.
        </p>
        <p>The top ten are shown; everyone else sees their own place.</p>
      </details>
    </>
  );
}

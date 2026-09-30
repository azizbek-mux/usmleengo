import React, { useEffect, useMemo, useState } from "react";
import { BOARDS, dayIndex, medalFor, rate } from "../lib/rating.js";
import { t } from "../lib/i18n.js";
import { displayName, usernameOf } from "../lib/scorecard.js";
import { ratingInput, today } from "../lib/storage.js";
import { haptic, telegramUser } from "../lib/telegram.js";
import { ScreenHead } from "./Chrome.jsx";
import PointsRules from "./PointsRules.jsx";

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
      name: profile ? displayName(profile) : t("You", "Siz"),
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
  return row.points.toLocaleString();
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
 * The rating is points, and only points: that is the rank. The day streak is
 * a filter — it re-sorts the same people by their run of days, for interest,
 * but a place there is not a rank and it adds nothing to the points.
 */
const FILTERS = BOARDS.filter((b) => b.id !== "overall");
const filteredBy = (id) => ({ streak: t("day streak", "kunlik intizom") })[id];

/** A board's name on its chip, and the heading of its value column. */
const boardName = (id) => ({ overall: t("Points", "Ball"), streak: t("Day streak", "Kunlik intizom") })[id];
const boardColumn = (id) => ({ overall: t("Points", "Ball"), streak: t("Days", "Kunlar") })[id];

/**
 * A place in the Rank column: the medal for the top three on the rating,
 * the number for everyone else — and for everyone on a filter, where a first
 * place has not won anything.
 */
export function PlaceMark({ place, medal = true }) {
  const m = medal ? medalFor(place) : null;
  return m ? <span className="board-medal" role="img" aria-label={t(`Place ${place}`, `${place}-o'rin`)}>{m}</span> : place;
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
          {row.isMe && name !== t("You", "Siz") && <span className="board-you">{t("you", "siz")}</span>}
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
  if (!(ms > 0)) return t("Resets now", "Hozir yangilanadi");
  const hours = Math.ceil(ms / 3600000);
  if (hours < 24) return t(`Resets in ${hours} h`, `${hours} soatdan keyin yangilanadi`);
  const days = Math.ceil(ms / 86400000);
  return days === 1 ? t("Resets tomorrow", "Ertaga yangilanadi") : t(`Resets in ${days} days`, `${days} kundan keyin yangilanadi`);
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
  const column = boardColumn(board);

  function choose(id) {
    haptic("light");
    setFilter((f) => (f === id ? null : id));
  }

  // Below the top ten, the viewer still sees their own row, after a gap.
  const meBelow = mine?.place > TOP
    ? { place: mine.place, isMe: true, points: me.rating.points, raw: me.rating.raw }
    : null;

  let placeLine;
  if (!standings) {
    placeLine = <span>{loading ? t("Loading the rating…", "Reyting yuklanmoqda…") : t("The rating cannot be reached right now", "Reytingga hozir ulanib bo'lmayapti")}</span>;
  } else if (places.overall.total <= 1) {
    placeLine = <span>{t("You are the first on the board", "Reytingda birinchi siz")}</span>;
  } else {
    placeLine = (
      <span className="rating-rank">
        {medalFor(places.overall.place) && `${medalFor(places.overall.place)} `}
        {ranked ? t("Your rank", "O'rningiz") : t("You would be", "O'rningiz bo'lardi")} <b>{rankText(places.overall)}</b>
      </span>
    );
  }

  const periods = (
    <div className="period" role="tablist" aria-label={t("Period", "Davr")}>
      {[["all", t("All time", "Barcha vaqt")], ["week", t("This week", "Shu hafta")]].map(([id, label]) => (
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
        <ScreenHead title={t("Rating", "Reyting")} sub={t("Everyone who plays, ranked by points", "Barcha o'yinchilar, ball bo'yicha")} />
        {periods}
        <WeekBoard week={week} me={me} ranked={ranked} standings={standings} loading={loading} />
      </div>
    );
  }

  return (
    <div className="screen rating">
      <ScreenHead title={t("Rating", "Reyting")} sub={t("Everyone who plays, ranked by points", "Barcha o'yinchilar, ball bo'yicha")} />
      {periods}

      <div className="rating-place">
        {placeLine}
        <b>{me.rating.points.toLocaleString()} <small>{t("pts", "ball")}</small></b>
      </div>

      {/* ── filter ────────────────────────────────────────────────────────── */}
      <div className="rating-filter" role="group" aria-label={t("Filter", "Saralash")}>
        <span className="rating-filter-l">{t("Filter", "Saralash")}</span>
        {FILTERS.map((b) => (
          <button
            key={b.id}
            aria-pressed={filter === b.id}
            className={`chip${filter === b.id ? " on" : ""}`}
            onClick={() => choose(b.id)}
          >
            {boardName(b.id)}
            {filter === b.id && <span className="chip-x" aria-hidden="true">×</span>}
          </button>
        ))}
      </div>

      {/* ── the table ─────────────────────────────────────────────────────── */}
      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>
          {filter
            ? t(`Filtered by ${filteredBy(filter)} · not the rating`, `Saralangan: ${filteredBy(filter)} · reyting emas`)
            : t("Rating · by points", "Reyting · ball bo'yicha")}
        </span>
        {filter && (
          <button className="chips-clear" onClick={() => { haptic("light"); setFilter(null); }}>
            {t("Show rating", "Reytingni ko'rsatish")}
          </button>
        )}
      </div>
      <div className="board">
        <div className="board-head">
          {/* Only the rating has ranks; a filter just numbers its order. */}
          <span className="board-place">{filter ? "#" : t("Rank", "O'rin")}</span>
          <span className="board-who">{t("Name", "Ism")}</span>
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
            {t("Nothing to rank yet.", "Hozircha reytingda hech kim yo'q.")}
          </div>
        )}
        {!standings && <div className="board-empty">{loading ? t("Loading…", "Yuklanmoqda…") : t("Try again in a moment.", "Birozdan so'ng qayta urinib ko'ring.")}</div>}
      </div>

      {standings && !ranked && (
        <div className="cta-note rating-web">{t("Open usmleengo in Telegram to be ranked.", "Reytingga kirish uchun usmleengoni Telegramda oching.")}</div>
      )}

      <details className="rating-how">
        <summary>{t("How points are counted", "Ballar qanday to'planadi")}</summary>
        <PointsRules />
        <p>
          {t(
            "Your place is by points alone. The top ten are shown with their Telegram name; everyone else sees only their own place.",
            "O'rningiz faqat ball bo'yicha belgilanadi. Eng yaxshi o'ntalik Telegramdagi ismi bilan ko'rsatiladi; qolganlar faqat o'z o'rnini ko'radi.",
          )}
        </p>
      </details>
    </div>
  );
}

/**
 * This week: the points earned since Monday, so everyone starts level each
 * Monday and a newcomer can win a week. The top ten, the viewer's own place,
 * and when it starts over.
 */
function WeekBoard({ week, me, ranked, standings, loading }) {
  const rows = week?.top || [];
  const mine = week?.me;
  const meBelow = mine?.place > TOP ? { place: mine.place, isMe: true, points: mine.points, raw: mine.raw } : null;

  let placeLine;
  if (!standings) {
    placeLine = <span>{loading ? t("Loading the rating…", "Reyting yuklanmoqda…") : t("The rating cannot be reached right now", "Reytingga hozir ulanib bo'lmayapti")}</span>;
  } else if (!ranked) {
    placeLine = <span>{t("Open usmleengo in Telegram to be ranked", "Reytingga kirish uchun usmleengoni Telegramda oching")}</span>;
  } else if (!mine?.place) {
    placeLine = <span>{t("Study today to join this week’s board", "Haftalik reytingga kirish uchun bugun shug'ullaning")}</span>;
  } else {
    placeLine = (
      <span className="rating-rank">
        {medalFor(mine.place) && `${medalFor(mine.place)} `}
        {t("This week", "Shu hafta")} <b>{rankText(mine)}</b>
      </span>
    );
  }

  return (
    <>
      <div className="rating-place">
        {placeLine}
        {mine?.place ? <b>{mine.points.toLocaleString()} <small>{t("pts", "ball")}</small></b> : null}
      </div>

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>{t("This week · by points", "Shu hafta · ball bo'yicha")}</span>
        {week?.endsAt && <span className="game-count">{resetsIn(week.endsAt)}</span>}
      </div>
      <div className="board">
        <div className="board-head">
          <span className="board-place">{t("Rank", "O'rin")}</span>
          <span className="board-who">{t("Name", "Ism")}</span>
          <span className="board-value">{t("Points", "Ball")}</span>
        </div>
        {rows.map((r) => <Row key={`${r.place}-${r.isMe ? "me" : r.name}-${r.username || ""}`} row={r} board="overall" me={me} />)}
        {meBelow && (
          <>
            <div className="board-gap" aria-hidden="true">⋯</div>
            <Row row={meBelow} board="overall" me={me} />
          </>
        )}
        {standings && !rows.length && (
          <div className="board-empty">
            {t("Nobody has studied yet this week. The first round puts you on top.",
              "Bu hafta hali hech kim shug'ullanmadi. Birinchi testingiz sizni birinchi o'ringa chiqaradi.")}
          </div>
        )}
        {!standings && <div className="board-empty">{loading ? t("Loading…", "Yuklanmoqda…") : t("Try again in a moment.", "Birozdan so'ng qayta urinib ko'ring.")}</div>}
      </div>

      <details className="rating-how">
        <summary>{t("How this week is counted", "Haftalik reyting qanday hisoblanadi")}</summary>
        <p>
          {t(
            "The points you earn from Monday to Sunday, counted the same way as the rating. Everyone starts level on Monday, so anyone can win a week, however long they have been playing. The top ten are shown; everyone else sees their own place.",
            "Dushanbadan yakshanbagacha to'plagan ballaringiz, reytingdagidek hisoblanadi. Dushanba kuni hamma teng boshlaydi, shuning uchun haftani har kim — qancha vaqtdan beri o'ynashidan qat'i nazar — yutishi mumkin. Eng yaxshi o'ntalik ko'rsatiladi; qolganlar o'z o'rnini ko'radi.",
          )}
        </p>
      </details>
    </>
  );
}

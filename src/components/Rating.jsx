import React, { useEffect, useMemo, useState } from "react";
import {
  BOARDS, TIME, WEIGHTS, dayIndex, formatPace, medalFor, points, rate,
} from "../lib/rating.js";
import { t } from "../lib/i18n.js";
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
const filteredBy = (id) => ({ streak: t("day streak", "kunlik intizom"), xp: "XP", speed: t("time", "vaqt") })[id];

/** A board's name on its chip, and the heading of its value column. */
const boardName = (id) => ({
  overall: t("Points", "Ball"), streak: t("Day streak", "Kunlik intizom"), xp: "XP", speed: t("Time", "Vaqt"),
})[id];
const boardColumn = (id) => ({
  overall: t("Points", "Ball"), streak: t("Days", "Kunlar"), xp: "XP", speed: t("Avg. time", "O'rt. vaqt"),
})[id];

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
    ? { place: mine.place, isMe: true, points: points(me.rating.overall), raw: me.rating.raw }
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
        <b>{points(me.rating.overall)} <small>{t("pts", "ball")}</small></b>
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
            {board === "speed"
              ? t("Answer a few questions correctly and your time appears here.", "Bir nechta savolga to'g'ri javob bering — vaqtingiz shu yerda chiqadi.")
              : t("Nothing to rank yet.", "Hozircha reytingda hech kim yo'q.")}
          </div>
        )}
        {!standings && <div className="board-empty">{loading ? t("Loading…", "Yuklanmoqda…") : t("Try again in a moment.", "Birozdan so'ng qayta urinib ko'ring.")}</div>}
      </div>

      {standings && !ranked && (
        <div className="cta-note rating-web">{t("Open usmleengo in Telegram to be ranked.", "Reytingga kirish uchun usmleengoni Telegramda oching.")}</div>
      )}

      <details className="rating-how">
        <summary>{t("How points are counted", "Ballar qanday hisoblanadi")}</summary>
        {t(
          <>
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
              Points mix three things, in this order of weight: <b>day streak</b>
              ({Math.round(WEIGHTS.streak * 100)}%), turning up day after day; <b>right and wrong
              answers</b> ({Math.round(WEIGHTS.mastery * 100)}%), how much you have shown you know;
              and <b>speed</b> ({Math.round(WEIGHTS.speed * 100)}%), how quickly you answer what you know.
            </p>
            <p>
              An answer counts for what it shows. A wrong tap takes away what a right one adds,
              so guessing earns nothing. A right answer counts in full when it is quick and less
              the longer it takes: a long wait looks like a look-up. An answer faster than the
              question can be read is a reflex and earns nothing. The clock stops the moment you
              answer, so reading the explanation is never counted. The same question again is
              worth half as much each time.
            </p>
            <p>
              Typing gets more time than tapping — {TIME.gap.free}s against {TIME.binary.free}s
              before the clock starts to cost you — and counts one and a half times, because a
              typed answer cannot be guessed.
            </p>
            <p>
              Each part levels off as it grows, so the top stays within reach of someone
              who started this month. A streak only counts while it is alive: miss two
              days and it is back to zero.
            </p>
          </>,
          <>
            <p>
              usmleengodan foydalanadigan har bir kishi avtomatik ravishda reytingga kiradi, o'rinlar
              bir daqiqa ichida yangilanadi. Eng yaxshi o'ntalik Telegramdagi ismi va foydalanuvchi
              nomi bilan ko'rsatiladi; qolganlar faqat o'z o'rnini ko'radi.
            </p>
            <p>
              <b>O'rningiz faqat ball bo'yicha belgilanadi.</b> Kunlik intizom, XP va vaqt bo'yicha
              saralash ballning har bir qismida kim oldinda ekanini ko'rsatadi, xolos — bular o'rin emas.
            </p>
            <p>
              Ball uch narsadan iborat, ulushi kattadan kichikka: <b>kunlik intizom</b>
              ({Math.round(WEIGHTS.streak * 100)}%) — har kuni shug'ullanish; <b>to'g'ri va noto'g'ri
              javoblar</b> ({Math.round(WEIGHTS.mastery * 100)}%) — bilimingizni qanchalik ko'rsatganingiz;
              <b> tezlik</b> ({Math.round(WEIGHTS.speed * 100)}%) — biladigan savolingizga qanchalik tez javob berishingiz.
            </p>
            <p>
              Har bir javob o'zi ko'rsatgan narsa uchun hisoblanadi. Noto'g'ri bosish to'g'ri javob
              qo'shganini qaytarib oladi, shuning uchun taxmin qilishdan foyda yo'q. To'g'ri javob tez
              berilsa to'liq hisoblanadi, uzoq o'ylansa kamayadi — uzoq kutish ko'pincha qidirib
              topilganini bildiradi. Savolni o'qishga ulgurmay bosilgan javob refleks hisoblanadi va
              hech narsa bermaydi. Vaqt javob bergan zahotingiz to'xtaydi, shuning uchun izohni o'qish
              vaqti hech qachon hisoblanmaydi. Bir xil savolga qayta to'g'ri javob har safar yarmiga
              kam hisoblanadi.
            </p>
            <p>
              Yozma javobga test javobidan ko'ra ko'proq vaqt beriladi — vaqt hisobga ta'sir qila
              boshlaguncha {TIME.gap.free} soniya va {TIME.binary.free} soniya — va u bir yarim baravar
              hisoblanadi, chunki yozma javobni tasodifan topib bo'lmaydi.
            </p>
            <p>
              Har bir qism o'sgan sari sekinlashadi, shuning uchun shu oy boshlagan kishi ham yuqoriga
              chiqa oladi. Kunlik intizom faqat uzilmaguncha hisoblanadi: ikki kun o'tkazib yuborsangiz,
              u nolga tushadi.
            </p>
          </>,
        )}
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
        {mine?.place ? <b>{mine.points} <small>{t("pts", "ball")}</small></b> : null}
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
        {t(
          <>
            <p>
              The same points as the rating, from this week alone: the <b>days you study</b> between
              Monday and Sunday count most, then the <b>XP</b> you earn this week, then your
              <b> average time</b> this week. Everyone starts level on Monday, so a week can be won
              by anyone — however long they have been playing.
            </p>
            <p>The top ten are shown; everyone else sees their own place.</p>
          </>,
          <>
            <p>
              Reytingdagi ballar, faqat shu hafta bo'yicha: eng katta ulush dushanbadan yakshanbagacha
              <b> shug'ullangan kunlaringiz</b>da, keyin shu hafta to'plagan <b>XP</b>ingizda, keyin shu
              haftadagi <b>o'rtacha vaqtingiz</b>da. Dushanba kuni hamma teng boshlaydi, shuning uchun
              haftani har kim — qancha vaqtdan beri o'ynashidan qat'i nazar — yutishi mumkin.
            </p>
            <p>Eng yaxshi o'ntalik ko'rsatiladi; qolganlar o'z o'rnini ko'radi.</p>
          </>,
        )}
      </details>
    </>
  );
}

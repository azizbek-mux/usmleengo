import React, { useEffect, useMemo, useRef, useState } from "react";
import bank, { bilingualBank } from "../data/bank.js";
import {
  CODE_RE, DEFAULT_SETTINGS, GAME_TYPES, MAX_PLAYERS, MIN_PLAYERS, QUESTION_COUNTS, SECONDS,
  STREAK_BONUS_MAX, availableFor, inviteLink, maxPoints, pickGameQuestions,
} from "../lib/game.js";
import { connectGame, createGame } from "../lib/gameApi.js";
import { scoped } from "../lib/account.js";
import { lang, t } from "../lib/i18n.js";
import CategoryGroup, { useCategories } from "./CategoryGroup.jsx";
import { inviteMessage } from "../lib/shareText.js";
import { subjectName, systemName } from "../lib/taxonomy.js";
import { APP_LINK, haptic, inTelegram, share } from "../lib/telegram.js";
import { BackBar, ScreenHead } from "./Chrome.jsx";
import { PlaceMark } from "./Rating.jsx";

// The multiplayer game: a live round among friends. See lib/game.js for the
// rules and worker/src/game.js for the server that runs each game. Nothing
// here reads or writes the player's own progress — a game is only a game.

const NICK_KEY = "usmle_game_nick";
const typeName = (id) => ({ binary: t("Tap", "Test"), gap: t("Typed", "Yozma"), mixed: t("Mixed", "Aralash") })[id] || id;
const gameTypes = () => GAME_TYPES.map((type) => ({ id: type.id, name: typeName(type.id) }));

function readNick() {
  try { return localStorage.getItem(scoped(NICK_KEY)) || ""; } catch { return ""; }
}
function writeNick(name) {
  try { localStorage.setItem(scoped(NICK_KEY), name); } catch { /* typed again next time */ }
}

/** "10 questions · 15s · Tap · Cardiovascular System, Pharmacology" */
export function describe(settings, total = settings.count) {
  const chosen = [
    ...(settings.systems || []).map(systemName),
    ...(settings.subjects || []).map(subjectName),
  ];
  const topics = chosen.length ? chosen.join(", ") : t("all topics", "barcha mavzular");
  return t(
    `${total} question${total === 1 ? "" : "s"} · ${settings.seconds}s · ${typeName(settings.qtype)} · ${topics}`,
    `${total} ta savol · ${settings.seconds} soniya · ${typeName(settings.qtype)} · ${topics}`,
  );
}

/** "482 193", easier to read out. */
const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** What went wrong, in words a player can act on. */
const reasons = () => ({
  missing: [t("No game with that code", "Bunday kodli o'yin yo'q"),
    t("It may have ended, or the code has a typo.", "U tugagan bo'lishi yoki kodda xato bo'lishi mumkin.")],
  started: [t("This game has already started", "Bu o'yin allaqachon boshlangan"),
    t("Wait for the round to end — the host can start a new one, and you can join then.",
      "Raund tugashini kuting — boshlovchi yangisini boshlaganda qo'shila olasiz.")],
  full: [t("This game is full", "Bu o'yin to'lgan"), t(`A game holds ${MAX_PLAYERS} players.`, `O'yinda ${MAX_PLAYERS} kishigacha bo'lishi mumkin.`)],
  closed: [t("This game was closed", "Bu o'yin yopilgan"), t("Nobody played for half an hour.", "Yarim soat davomida hech kim o'ynamadi.")],
  offline: [t("Lost the connection", "Aloqa uzildi"),
    t("Check your internet, then join again with the same code.", "Internetni tekshiring va o'sha kod bilan qayta qo'shiling.")],
  create: [t("Couldn’t create the game", "O'yinni yaratib bo'lmadi"), t("Check your internet and try again.", "Internetni tekshirib, qayta urinib ko'ring.")],
});

/* ── the way in ──────────────────────────────────────────────────────── */

export default function Game({ invite, onFocus }) {
  const [nickname, setNickname] = useState(readNick);
  // Inside Telegram the name comes from Telegram. On the web it is typed.
  const nameOk = inTelegram || nickname.trim().length > 0;
  // An invite opens the game directly — once there is a name to join with.
  const [stage, setStage] = useState(() => (invite && CODE_RE.test(invite) && nameOk ? "play" : "menu"));
  const [code, setCode] = useState(invite || "");
  // Setting up and playing want the whole screen; only the menu keeps the tab bar.
  useEffect(() => {
    onFocus?.(stage !== "menu");
    return () => onFocus?.(false);
  }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

  function play(nextCode) {
    if (!inTelegram) writeNick(nickname.trim());
    setCode(nextCode);
    setStage("play");
  }

  if (stage === "setup") {
    return <GameSetup onBack={() => setStage("menu")} onCreated={play} />;
  }
  if (stage === "play") {
    return <LiveGame key={code} code={code} nickname={nickname.trim()} onLeave={() => setStage("menu")} />;
  }
  return (
    <GameMenu
      code={code}
      setCode={setCode}
      nickname={nickname}
      setNickname={setNickname}
      nameOk={nameOk}
      invited={Boolean(invite)}
      onCreate={() => {
        if (!inTelegram) writeNick(nickname.trim());
        setStage("setup");
      }}
      onJoin={() => play(code)}
    />
  );
}

function GameMenu({ code, setCode, nickname, setNickname, nameOk, invited, onCreate, onJoin }) {
  const codeOk = CODE_RE.test(code);
  return (
    <div className="screen">
      <ScreenHead title={t("Multiplayer", "O'yin")} sub={t("Live game with friends", "Do'stlar bilan jonli o'yin")} />

      <div className="game-hero">
        <div className="game-hero-t">{t("Play live with friends", "Do'stlaringiz bilan jonli o'ynang")}</div>
        <div className="game-hero-n">
          {t("Everyone gets the same question at the same moment. Right and fast wins. Nothing here changes your points or streak.",
            "Hamma bir xil savolni bir vaqtda oladi. To'g'ri va tez javob bergan yutadi. Bu yerda ballaringiz va kunlik intizomingiz o'zgarmaydi.")}
        </div>
      </div>

      {!inTelegram && (
        <label className="game-field">
          <span className="section-label">{t("Your name", "Ismingiz")}</span>
          <input
            className="gap-input"
            value={nickname}
            maxLength={40}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t("How friends will see you", "Do'stlaringiz sizni shu nom bilan ko'radi")}
            autoComplete="nickname"
          />
        </label>
      )}

      <button className="btn btn-primary" disabled={!nameOk} onClick={() => { haptic("medium"); onCreate(); }}>
        {t("Create a game", "O'yin yaratish")}
      </button>

      <div className="section-label game-or">{invited ? t("Your invite", "Sizga taklif") : t("Or join one", "Yoki o'yinga qo'shiling")}</div>
      <form
        className="game-join"
        onSubmit={(e) => {
          e.preventDefault();
          if (codeOk && nameOk) { haptic("medium"); onJoin(); }
        }}
      >
        <input
          className="gap-input game-code-input"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder={t("6-digit code", "6 xonali kod")}
          inputMode="numeric"
          autoComplete="off"
          aria-label={t("Game code", "O'yin kodi")}
        />
        <button className="btn btn-ghost game-join-btn" disabled={!codeOk || !nameOk}>{t("Join", "Qo'shilish")}</button>
      </form>
      {!nameOk && <div className="cta-note">{t("Type your name first.", "Avval ismingizni yozing.")}</div>}
    </div>
  );
}

/* ── setting up ──────────────────────────────────────────────────────── */

/** A row of choices: plain values, or { id, name } pairs. */
function Presets({ values, value, onPick, label = "" }) {
  return (
    <div className="count-presets game-presets">
      {values.map((v) => {
        const id = v.id ?? v;
        return (
          <button
            key={id}
            className={`preset${id === value ? " on" : ""}`}
            onClick={() => { haptic("light"); onPick(id); }}
          >
            {v.name ?? `${v}${label}`}
          </button>
        );
      })}
    </div>
  );
}

function GameSetup({ onBack, onCreated }) {
  const [qtype, setQtype] = useState(DEFAULT_SETTINGS.qtype);
  const [count, setCount] = useState(DEFAULT_SETTINGS.count);
  const [seconds, setSeconds] = useState(DEFAULT_SETTINGS.seconds);
  const [systems, setSystems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const groups = useCategories(lang());
  const systemSet = useMemo(() => new Set(systems), [systems]);
  const subjectSet = useMemo(() => new Set(subjects), [subjects]);
  const available = useMemo(() => availableFor(bank, { systems, subjects, qtype }), [systems, subjects, qtype]);
  const picked = systems.length + subjects.length;

  const flip = (set) => (id) => {
    haptic("light");
    set((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  };

  async function create() {
    haptic("medium");
    setBusy(true);
    setFailed(false);
    const settings = { qtype, count, seconds, systems, subjects };
    try {
      // Both languages go up with the questions, so a game can be shared
      // with a friend who reads the app in the other one.
      const code = await createGame(settings, pickGameQuestions(await bilingualBank(), settings));
      onCreated(code);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <BackBar title={t("New game", "Yangi o'yin")} onBack={onBack} />

      <div className="section-label">{t("Question type", "Savol turi")}</div>
      <Presets values={gameTypes()} value={qtype} onPick={setQtype} />

      <div className="section-label">{t("Questions", "Savollar soni")}</div>
      <Presets values={QUESTION_COUNTS} value={count} onPick={setCount} />

      <div className="section-label">{t("Time for each question", "Har bir savolga vaqt")}</div>
      <Presets values={SECONDS} value={seconds} onPick={setSeconds} label="s" />

      <CategoryGroup
        label={t("Systems", "Tizimlar")}
        rows={groups.systems}
        chosen={systemSet}
        onToggle={flip(setSystems)}
        onAll={() => { haptic("light"); setSystems(groups.systems.map((r) => r.id)); }}
        onNone={() => { haptic("light"); setSystems([]); }}
      />
      <CategoryGroup
        label={t("Subjects", "Fanlar")}
        rows={groups.subjects}
        chosen={subjectSet}
        onToggle={flip(setSubjects)}
        onAll={() => { haptic("light"); setSubjects(groups.subjects.map((r) => r.id)); }}
        onNone={() => { haptic("light"); setSubjects([]); }}
      />

      <div className="home-cta">
        {failed && <div className="game-warn">{reasons().create[0]}. {reasons().create[1]}</div>}
        <button className="btn btn-primary" disabled={busy || !available} onClick={create}>
          {busy ? t("Creating…", "Yaratilmoqda…") : t("Create game", "O'yinni yaratish")}
        </button>
        <div className="cta-note">
          {!available
            ? t("No questions match these choices.", "Bu tanlovga mos savol yo'q.")
            : available < count
              ? t(`Only ${available} question${available === 1 ? "" : "s"} match — the game will have ${available}.`,
                `Faqat ${available} ta savol mos keladi — o'yinda ${available} ta savol bo'ladi.`)
              : t(`${picked ? "Chosen categories" : "All categories"} · ${available.toLocaleString()} questions to pick from, at random`,
                `${picked ? "Tanlangan yo'nalishlar" : "Barcha yo'nalishlar"} · ${available.toLocaleString()} ta savoldan tasodifiy tanlanadi`)}
        </div>
      </div>
    </div>
  );
}

/* ── in a game ───────────────────────────────────────────────────────── */

/** Re-render on a steady beat while something is counting down. */
function useBeat(active, ms = 100) {
  const [, setBeat] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const id = setInterval(() => setBeat((b) => b + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

function LiveGame({ code, nickname, onLeave }) {
  const [game, setGame] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const conn = useRef(null);
  // The server's clock minus this phone's, so every phone's countdown ends
  // together whatever its own clock says.
  const skew = useRef(0);

  useEffect(() => {
    const c = connectGame(code, {
      nickname,
      onState: (s) => {
        skew.current = s.now - Date.now();
        setGame(s);
      },
      onStatus: setStatus,
      onError: setError,
      onNotice: setNotice,
    });
    conn.current = c;
    return () => c.close(false);
  }, [code, nickname]);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(id);
  }, [notice]);

  const serverNow = () => Date.now() + skew.current;
  const send = (msg) => conn.current?.send(msg);

  function leave() {
    haptic("light");
    conn.current?.close(true);
    onLeave();
  }

  if (error) {
    const [title, body] = reasons()[error] || [t("Something went wrong", "Nimadir xato ketdi"), t("Try joining again.", "Qayta qo'shilib ko'ring.")];
    return (
      <div className="screen">
        <BackBar title={t("Multiplayer", "O'yin")} onBack={onLeave} />
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="empty-big">🎮</div>
          <div className="game-err-t">{title}</div>
          <div className="sub" style={{ marginTop: 6 }}>{body}</div>
        </div>
        <div className="home-cta">
          <button className="btn btn-primary" onClick={onLeave}>{t("Back", "Orqaga")}</button>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="screen">
        <BackBar title={t("Multiplayer", "O'yin")} onBack={leave} />
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="empty-big">🎮</div>
          <div>{status === "reconnecting" ? t("Reconnecting…", "Qayta ulanmoqda…") : t(`Joining game ${spaced(code)}…`, `${spaced(code)} o'yiniga qo'shilinmoqda…`)}</div>
        </div>
      </div>
    );
  }

  const me = game.players.find((p) => p.pid === game.you);
  const inPlay = game.phase === "question" || game.phase === "reveal";

  return (
    <div className="screen game">
      <div className="game-top">
        <button className="close" onClick={() => { haptic("light"); setConfirmLeave(true); }} aria-label={t("Leave the game", "O'yindan chiqish")}>×</button>
        <span className="game-top-t">
          {inPlay
            ? t(`Question ${game.index + 1} of ${game.total}`, `${game.total} tadan ${game.index + 1}-savol`)
            : game.phase === "final" ? t("Results", "Natijalar") : t("Game lobby", "Kutish xonasi")}
        </span>
        <span className="game-top-me">{me && game.phase !== "lobby" ? t(`${me.score.toLocaleString()} pts`, `${me.score.toLocaleString()} ball`) : ""}</span>
      </div>

      {confirmLeave && (
        <div className="game-confirm" role="alertdialog" aria-label={t("Leave the game?", "O'yindan chiqasizmi?")}>
          <span>
            {game.phase === "lobby" || game.phase === "final"
              ? t("Leave this game?", "O'yindan chiqasizmi?")
              : t("Leave? Your points stay on the board.", "Chiqasizmi? Ballaringiz jadvalda qoladi.")}
          </span>
          <button className="chips-clear" onClick={() => setConfirmLeave(false)}>{t("Stay", "Qolish")}</button>
          <button className="chips-clear game-confirm-go" onClick={leave}>{t("Leave", "Chiqish")}</button>
        </div>
      )}
      {status === "reconnecting" && <div className="game-warn">{t("Reconnecting…", "Qayta ulanmoqda…")}</div>}
      {notice === "too-few" && <div className="game-warn">{t(`At least ${MIN_PLAYERS} players are needed to start.`, `Boshlash uchun kamida ${MIN_PLAYERS} kishi kerak.`)}</div>}

      {game.phase === "lobby" && <Lobby game={game} send={send} />}
      {game.phase === "question" && (
        <Question key={`${game.round}-${game.index}`} game={game} serverNow={serverNow} send={send} />
      )}
      {game.phase === "reveal" && (
        <Reveal key={`${game.round}-${game.index}`} game={game} serverNow={serverNow} />
      )}
      {game.phase === "final" && <Final game={game} send={send} onLeave={leave} />}
    </div>
  );
}

function PlayerName({ p, you, host }) {
  return (
    <span className="board-who">
      <span className="board-name">
        {p.name}
        {p.pid === you && <span className="board-you">{t("you", "siz")}</span>}
        {p.pid === host && <span className="game-host">{t("host", "boshlovchi")}</span>}
      </span>
      {p.username && <span className="board-user">@{p.username}</span>}
    </span>
  );
}

function Lobby({ game, send }) {
  const isHost = game.host === game.you;
  const here = game.players.filter((p) => p.connected);
  const host = game.players.find((p) => p.pid === game.host);
  const link = inviteLink(APP_LINK, game.code);

  return (
    <>
      <div className="game-code-card">
        <span className="perf-points-l">{t("Game code", "O'yin kodi")}</span>
        <span className="game-code">{spaced(game.code)}</span>
        <span className="game-code-about">{describe(game.settings, game.total)}</span>
        <button
          className="btn btn-primary btn-icon game-share"
          onClick={() => {
            haptic("medium");
            share(inviteMessage({ code: game.code, about: describe(game.settings, game.total), link }));
          }}
        >
          {t("Share invite", "Taklifni ulashish")}
        </button>
      </div>

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>{t("Players", "O'yinchilar")}</span>
        <span className="game-count">{here.length} / {MAX_PLAYERS}</span>
      </div>
      <div className="board">
        {game.players.map((p) => (
          <div key={p.pid} className={`board-row${p.pid === game.you ? " me" : ""}${p.connected ? "" : " away"}`}>
            <PlayerName p={p} you={game.you} host={game.host} />
            {!p.connected && <span className="game-away">{t("away", "chiqib ketgan")}</span>}
          </div>
        ))}
      </div>

      <div className="home-cta">
        {isHost ? (
          <>
            <button
              className="btn btn-primary"
              disabled={here.length < MIN_PLAYERS}
              onClick={() => { haptic("medium"); send({ type: "start" }); }}
            >
              {t("Start game", "O'yinni boshlash")}
            </button>
            <div className="cta-note">
              {here.length < MIN_PLAYERS
                ? t("Waiting for at least one more player — share the invite.", "Yana kamida bitta o'yinchi kerak — taklifni ulashing.")
                : t(`Right earns ${maxPoints() / 2} to ${maxPoints().toLocaleString()} a question: the faster, the more. Right answers in a row add a bonus of up to ${STREAK_BONUS_MAX}. Wrong earns 0.`,
                  `To'g'ri javob har bir savolga ${maxPoints() / 2} dan ${maxPoints().toLocaleString()} gacha ball beradi: qanchalik tez bo'lsa, shunchalik ko'p. Ketma-ket to'g'ri javoblar ${STREAK_BONUS_MAX} gacha bonus qo'shadi. Noto'g'ri javob — 0.`)}
            </div>
          </>
        ) : (
          <div className="game-wait">
            {t(`Waiting for ${host?.name || "the host"} to start…`, `${host?.name || "Boshlovchi"} o'yinni boshlashini kutyapmiz…`)}
          </div>
        )}
      </div>
    </>
  );
}

function Question({ game, serverNow, send }) {
  useBeat(true);
  const [picked, setPicked] = useState(null);
  const [typed, setTyped] = useState("");
  const [zoom, setZoom] = useState(false);
  const inputRef = useRef(null);

  const q = game.question;
  const now = serverNow();
  // Only the first question has a get-ready. The rest open the moment the
  // scoreboard ends — gated on the index, not the clock, so a phone whose
  // clock runs a hair behind the server's never flashes a countdown.
  const waiting = game.index === 0 && now < game.opensAt;
  const limit = game.settings.seconds * 1000;
  const left = Math.max(0, game.endsAt - now);
  const timeUp = !waiting && left <= 0;
  // What this phone chose: the server's word once it has it, ours until then.
  const given = game.mine ? game.mine.given : picked;
  const answered = given !== null && given !== undefined;
  const answeredCount = game.players.filter((p) => p.answered).length;
  const here = game.players.filter((p) => p.connected).length;

  useEffect(() => {
    if (!waiting && q.type === "gap" && !answered) {
      const id = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [waiting]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(i) {
    if (answered || waiting || timeUp) return;
    if (!send({ type: "answer", index: game.index, choice: i })) return;
    haptic("light");
    setPicked(i);
  }

  function submit(e) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || answered || waiting || timeUp) return;
    if (!send({ type: "answer", index: game.index, text })) return;
    haptic("light");
    inputRef.current?.blur();
    setPicked(text);
  }

  if (waiting) {
    return (
      <div className="game-ready">
        <div className="game-ready-n">{t(`Question ${game.index + 1}`, `${game.index + 1}-savol`)}</div>
        <div className="game-ready-c">{Math.ceil((game.opensAt - now) / 1000)}</div>
        <div className="sub">{typeName(q.type === "gap" ? "gap" : "binary")} · {t(`${game.settings.seconds} seconds`, `${game.settings.seconds} soniya`)}</div>
      </div>
    );
  }

  return (
    <>
      <div className="game-timer">
        <div className="bar">
          <div className={`bar-fill game-timer-fill${left < 3000 ? " low" : ""}`} style={{ width: `${(left / limit) * 100}%` }} />
        </div>
        <span className="game-timer-s">{Math.ceil(left / 1000)}</span>
      </div>

      {q.topic ? <div className="q-topic">{q.topic}</div> : <div className="q-topic-gap" />}

      {q.img ? (
        <button className="q-img" onClick={() => setZoom(true)} aria-label={t("Enlarge picture", "Rasmni kattalashtirish")}>
          <img src={`${import.meta.env.BASE_URL}img/${q.img}`} alt="" />
          <span className="q-img-hint">{t("tap to enlarge", "kattalashtirish uchun bosing")}</span>
        </button>
      ) : (
        <div className="q-text">
          {q.type === "gap"
            ? q.q.split("___").map((part, i, all) => (
              <React.Fragment key={i}>
                {part}
                {i < all.length - 1 && <span className="gap">&nbsp;&nbsp;?&nbsp;&nbsp;</span>}
              </React.Fragment>
            ))
            : q.q}
        </div>
      )}

      {q.type === "binary" ? (
        <div className="options">
          {q.options.map((opt, i) => (
            <button
              key={i}
              className={`opt${answered ? (given === i ? " picked" : " faded") : ""}`}
              onClick={() => choose(i)}
              disabled={answered || timeUp}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={submit}>
          <input
            ref={inputRef}
            className={`gap-input${answered ? " picked" : ""}`}
            value={answered ? String(given) : typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t("Type your answer…", "Javobingizni yozing…")}
            disabled={answered || timeUp}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            enterKeyHint="send"
          />
          {!answered && !timeUp && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={!typed.trim()}>{t("Answer", "Javob berish")}</button>
          )}
        </form>
      )}

      <div className="game-status">
        {answered
          ? t(`✓ Answer in · ${answeredCount} of ${here} answered`, `✓ Javobingiz qabul qilindi · ${here} tadan ${answeredCount} tasi javob berdi`)
          : timeUp
            ? t("⏱ Time’s up", "⏱ Vaqt tugadi")
            : t(`${answeredCount} of ${here} answered`, `${here} tadan ${answeredCount} tasi javob berdi`)}
      </div>

      {zoom && q.img && (
        <div className="zoom" onClick={() => setZoom(false)} role="dialog" aria-label={t("Picture", "Rasm")}>
          <img src={`${import.meta.env.BASE_URL}img/${q.img}`} alt="" />
          <button className="zoom-x" aria-label={t("Close", "Yopish")}>×</button>
        </div>
      )}
    </>
  );
}

const ordinal = (n) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] || "th"}`;
};

/** "You're 2nd · 340 behind Laylo", or the lead — each player's own line, as on Kahoot. */
function standingLine(game) {
  const me = game.players.find((p) => p.pid === game.you);
  if (!me) return null;
  if (me.place === 1) return t("🏆 You’re in the lead", "🏆 Siz oldindasiz");
  // Players arrive sorted by score, so the last one ahead is the one to catch.
  const ahead = game.players.filter((p) => p.score > me.score);
  const next = ahead[ahead.length - 1];
  const gap = (next.score - me.score).toLocaleString();
  // The Uzbek names the one ahead without a case ending, which a name can't always take.
  return t(`You’re ${ordinal(me.place)} · ${gap} behind ${next.name}`, `Siz ${me.place}-o'rindasiz · ${next.name} ${gap} ball oldinda`);
}

/** The top few, and this player below them if they are further down. */
function Standings({ game, top = 5, showGain = false }) {
  const rows = game.players.slice(0, top);
  const mine = game.players.find((p) => p.pid === game.you);
  const below = mine && !rows.includes(mine) ? mine : null;
  const Row = ({ p }) => (
    <div className={`board-row${p.pid === game.you ? " me" : ""}${p.place <= 3 ? ` p${p.place}` : ""}`}>
      <span className="board-place"><PlaceMark place={p.place} /></span>
      <PlayerName p={p} you={game.you} host={null} />
      <span className="game-score">
        {showGain && p.gained > 0 && <span className="game-gain">+{p.gained.toLocaleString()}</span>}
        <span className="board-value">{p.score.toLocaleString()}</span>
      </span>
    </div>
  );
  return (
    <div className="board">
      {rows.map((p) => <Row key={p.pid} p={p} />)}
      {below && (
        <>
          <div className="board-gap" aria-hidden="true">⋯</div>
          <Row p={below} />
        </>
      )}
    </div>
  );
}

function Reveal({ game, serverNow }) {
  useBeat(true, 250);
  const mine = game.mine;
  const q = game.question;
  const answer = q.type === "binary" ? q.options[game.solution.answer] : game.solution.answer;
  const last = game.index + 1 >= game.total;
  const left = Math.max(0, Math.ceil((game.revealEndsAt - serverNow()) / 1000));

  useEffect(() => { haptic(mine?.correct ? "success" : "error"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const verdict = !mine ? "none" : mine.correct ? "ok" : "no";
  const tally = game.solution.tally;
  return (
    <>
      <div className={`game-result ${verdict}`}>
        <span className="game-result-t">
          {verdict === "ok" ? t("✓ Correct", "✓ To'g'ri") : verdict === "no" ? t("✗ Wrong", "✗ Noto'g'ri") : t("⏱ No answer", "⏱ Javob berilmadi")}
        </span>
        <span className="game-result-p">+{((mine?.points || 0) + (mine?.bonus || 0)).toLocaleString()}</span>
      </div>
      {mine?.bonus > 0 && (
        <div className="game-streak">
          {t(`🔥 ${mine.streak} right in a row · +${mine.bonus} bonus`, `🔥 ketma-ket ${mine.streak} ta to'g'ri · +${mine.bonus} bonus`)}
        </div>
      )}
      <div className="game-behind">{standingLine(game)}</div>

      {q.type === "binary" && tally ? (
        // How the room split, as Kahoot shows it, with the right answer ticked.
        <div className="game-tally">
          {q.options.map((opt, i) => {
            const n = tally.options[i];
            const right = i === game.solution.answer;
            return (
              <div key={i} className={`game-tally-row${right ? " right" : ""}`}>
                <span className="game-tally-bar" style={{ width: `${tally.answered ? (n / tally.answered) * 100 : 0}%` }} />
                <span className="game-tally-t">
                  {right ? "✓ " : ""}{opt}
                  {mine?.given === i && <span className="game-tally-you"> · {t("you", "siz")}</span>}
                </span>
                <span className="game-tally-n">{n}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="game-answer">
          {t("Answer:", "Javob:")} <b>{answer}</b>
          {tally && <span className="game-explain"> · {t(`${tally.right} of ${tally.answered} got it`, `${tally.answered} tadan ${tally.right} tasi topdi`)}</span>}
        </div>
      )}
      {game.solution.explain && <div className="game-answer game-explain">{game.solution.explain}</div>}

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>{t("Scoreboard", "Natijalar jadvali")}</span>
        <span className="game-count">
          {last
            ? t(`Final results in ${left}`, `Yakuniy natijalar ${left} soniyadan keyin`)
            : t(`Next question in ${left}`, `Keyingi savol ${left} soniyadan keyin`)}
        </span>
      </div>
      <Standings game={game} showGain />
    </>
  );
}

function Final({ game, send, onLeave }) {
  const isHost = game.host === game.you;
  const mine = game.players.find((p) => p.pid === game.you);
  const podium = game.players.filter((p) => p.place <= 3).slice(0, 3);
  const host = game.players.find((p) => p.pid === game.host);
  const medal = ["🥇", "🥈", "🥉"];

  useEffect(() => { haptic(mine?.place === 1 ? "success" : "light"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function again() {
    haptic("medium");
    const s = game.settings;
    const pool = await bilingualBank();
    send({ type: "again", questions: pickGameQuestions(pool, { systems: s.systems, subjects: s.subjects, qtype: s.qtype, count: s.count }) });
  }

  return (
    <>
      <div className="game-podium">
        {podium.map((p) => (
          <div key={p.pid} className={`game-podium-step s${p.place}`}>
            <span className="game-podium-m">{medal[p.place - 1]}</span>
            <span className="game-podium-n">{p.name}</span>
            <span className="game-podium-s">{p.score.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {mine && (
        <div className="rating-place">
          <span>{t("You finished", "Yakuniy o'rningiz")} <b className="game-place">{t(`#${mine.place} of ${game.players.length}`, `#${mine.place} / ${game.players.length}`)}</b></span>
          <b>{mine.score.toLocaleString()} <small>{t("pts", "ball")}</small></b>
        </div>
      )}
      {mine && (
        <div className="cta-note game-final-note">
          {t(`${mine.correct} of ${game.total} right`, `${game.total} tadan ${mine.correct} tasi to'g'ri`)}
          {game.round > 1 ? t(` · round ${game.round}`, ` · ${game.round}-raund`) : ""}
        </div>
      )}

      <div className="section-label">{t("Everyone", "Barcha o'yinchilar")}</div>
      <Standings game={game} top={MAX_PLAYERS} />

      <div className="home-cta">
        {isHost ? (
          <button className="btn btn-primary" onClick={again}>{t("New round", "Yangi raund")}</button>
        ) : (
          <div className="game-wait">
            {t(`Waiting for ${host?.name || "the host"} to start a new round…`, `${host?.name || "Boshlovchi"} yangi raund boshlashini kutyapmiz…`)}
          </div>
        )}
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={onLeave}>{t("Leave game", "O'yindan chiqish")}</button>
      </div>
    </>
  );
}

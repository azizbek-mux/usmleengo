import React, { useEffect, useMemo, useRef, useState } from "react";
import bank from "../data/bank.js";
import {
  CODE_RE, DEFAULT_SETTINGS, GAME_TYPES, MAX_PLAYERS, MIN_PLAYERS, QUESTION_COUNTS, SECONDS,
  availableFor, inviteLink, maxPoints, pickGameQuestions,
} from "../lib/game.js";
import { connectGame, createGame } from "../lib/gameApi.js";
import { subjects } from "../lib/match.js";
import { inviteMessage } from "../lib/shareText.js";
import { PICTURE_TAGS, tagLabel } from "../lib/tags.js";
import { APP_LINK, haptic, inTelegram, share } from "../lib/telegram.js";
import { BackBar, ScreenHead } from "./Chrome.jsx";
import { PlaceMark } from "./Rating.jsx";

// The multiplayer game: a live round among friends. See lib/game.js for the
// rules and worker/src/game.js for the server that runs each game. Nothing
// here reads or writes the player's own progress — a game is only a game.

const NICK_KEY = "usmle_game_nick";
const typeName = (id) => GAME_TYPES.find((t) => t.id === id)?.name || id;

function readNick() {
  try { return localStorage.getItem(NICK_KEY) || ""; } catch { return ""; }
}
function writeNick(name) {
  try { localStorage.setItem(NICK_KEY, name); } catch { /* typed again next time */ }
}

/** "10 questions · 15s · Tap · cardio, renal" */
export function describe(settings, total = settings.count) {
  const topics = settings.tags?.length
    ? settings.tags.map(tagLabel).join(", ")
    : "all topics";
  return `${total} question${total === 1 ? "" : "s"} · ${settings.seconds}s · ${typeName(settings.qtype)} · ${topics}`;
}

/** "482 193", easier to read out. */
const spaced = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** What went wrong, in words a player can act on. */
const REASONS = {
  missing: ["No game with that code", "It may have ended, or the code has a typo."],
  started: ["This game has already started", "Wait for the round to end — the host can start a new one, and you can join then."],
  full: ["This game is full", `A game holds ${MAX_PLAYERS} players.`],
  closed: ["This game was closed", "Nobody played for half an hour."],
  offline: ["Lost the connection", "Check your internet, then join again with the same code."],
  create: ["Couldn’t create the game", "Check your internet and try again."],
};

/* ── the way in ──────────────────────────────────────────────────────── */

export default function Game({ invite, onFocus }) {
  const [nickname, setNickname] = useState(readNick);
  // Inside Telegram the name comes from Telegram. On the web it is typed.
  const nameOk = inTelegram || nickname.trim().length > 0;
  // An invite opens the game directly — once there is a name to join with.
  const [stage, setStage] = useState(() => (invite && CODE_RE.test(invite) && nameOk ? "play" : "menu"));
  const [code, setCode] = useState(invite || "");
  // Setting up and playing want the whole screen; only the menu keeps the tab bar.
  useEffect(() => { onFocus?.(stage !== "menu"); }, [stage]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <ScreenHead title="Multiplayer" sub="Live game with friends" />

      <div className="game-hero">
        <div className="game-hero-t">Play live with friends</div>
        <div className="game-hero-n">
          Everyone gets the same question at the same moment. Right and fast wins.
          Nothing here changes your XP, streak or rating.
        </div>
      </div>

      {!inTelegram && (
        <label className="game-field">
          <span className="section-label">Your name</span>
          <input
            className="gap-input"
            value={nickname}
            maxLength={40}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="How friends will see you"
            autoComplete="nickname"
          />
        </label>
      )}

      <button className="btn btn-primary" disabled={!nameOk} onClick={() => { haptic("medium"); onCreate(); }}>
        Create a game
      </button>

      <div className="section-label game-or">{invited ? "Your invite" : "Or join one"}</div>
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
          placeholder="6-digit code"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Game code"
        />
        <button className="btn btn-ghost game-join-btn" disabled={!codeOk || !nameOk}>Join</button>
      </form>
      {!nameOk && <div className="cta-note">Type your name first.</div>}
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
  const [tags, setTags] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const chips = useMemo(() => subjects().slice(0, 12), []);
  const available = useMemo(() => availableFor(bank, { tags, qtype }), [tags, qtype]);

  function toggle(tag) {
    haptic("light");
    setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]));
  }

  async function create() {
    haptic("medium");
    setBusy(true);
    setFailed(false);
    const settings = { qtype, count, seconds, tags };
    try {
      const code = await createGame(settings, pickGameQuestions(bank, settings));
      onCreated(code);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <BackBar title="New game" onBack={onBack} />

      <div className="section-label">Question type</div>
      <Presets values={GAME_TYPES} value={qtype} onPick={setQtype} />

      <div className="section-label">Questions</div>
      <Presets values={QUESTION_COUNTS} value={count} onPick={setCount} />

      <div className="section-label">Time for each question</div>
      <Presets values={SECONDS} value={seconds} onPick={setSeconds} label="s" />

      <div className="chips-head">
        <span className="section-label" style={{ margin: 0 }}>Topics</span>
        {tags.length > 0 && (
          <button className="chips-clear" onClick={() => { haptic("light"); setTags([]); }}>Clear {tags.length}</button>
        )}
      </div>
      <div className="chips">
        {[...PICTURE_TAGS, ...chips.map(({ tag }) => tag)].map((tag) => ({ tag, name: tagLabel(tag) }))
          .map(({ tag, name }) => (
            <button
              key={tag}
              className={`chip${tags.includes(tag) ? " on" : ""}`}
              aria-pressed={tags.includes(tag)}
              onClick={() => toggle(tag)}
            >
              {name}
            </button>
          ))}
      </div>

      <div className="home-cta">
        {failed && <div className="game-warn">{REASONS.create[0]}. {REASONS.create[1]}</div>}
        <button className="btn btn-primary" disabled={busy || !available} onClick={create}>
          {busy ? "Creating…" : "Create game"}
        </button>
        <div className="cta-note">
          {!available
            ? "No questions match these choices."
            : available < count
              ? `Only ${available} question${available === 1 ? "" : "s"} match — the game will have ${available}.`
              : `${tags.length ? "Chosen topics" : "All topics"} · ${available.toLocaleString()} questions to pick from, at random`}
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
    const [title, body] = REASONS[error] || ["Something went wrong", "Try joining again."];
    return (
      <div className="screen">
        <BackBar title="Multiplayer" onBack={onLeave} />
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="empty-big">🎮</div>
          <div className="game-err-t">{title}</div>
          <div className="sub" style={{ marginTop: 6 }}>{body}</div>
        </div>
        <div className="home-cta">
          <button className="btn btn-primary" onClick={onLeave}>Back</button>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="screen">
        <BackBar title="Multiplayer" onBack={leave} />
        <div className="empty" style={{ marginTop: 40 }}>
          <div className="empty-big">🎮</div>
          <div>{status === "reconnecting" ? "Reconnecting…" : `Joining game ${spaced(code)}…`}</div>
        </div>
      </div>
    );
  }

  const me = game.players.find((p) => p.pid === game.you);
  const inPlay = game.phase === "question" || game.phase === "reveal";

  return (
    <div className="screen game">
      <div className="game-top">
        <button className="close" onClick={() => { haptic("light"); setConfirmLeave(true); }} aria-label="Leave the game">×</button>
        <span className="game-top-t">
          {inPlay ? `Question ${game.index + 1} of ${game.total}` : game.phase === "final" ? "Results" : "Game lobby"}
        </span>
        <span className="game-top-me">{me && game.phase !== "lobby" ? `${me.score.toLocaleString()} pts` : ""}</span>
      </div>

      {confirmLeave && (
        <div className="game-confirm" role="alertdialog" aria-label="Leave the game?">
          <span>
            {game.phase === "lobby" || game.phase === "final"
              ? "Leave this game?"
              : "Leave? Your points stay on the board."}
          </span>
          <button className="chips-clear" onClick={() => setConfirmLeave(false)}>Stay</button>
          <button className="chips-clear game-confirm-go" onClick={leave}>Leave</button>
        </div>
      )}
      {status === "reconnecting" && <div className="game-warn">Reconnecting…</div>}
      {notice === "too-few" && <div className="game-warn">At least {MIN_PLAYERS} players are needed to start.</div>}

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
        {p.pid === you && <span className="board-you">you</span>}
        {p.pid === host && <span className="game-host">host</span>}
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
        <span className="perf-points-l">Game code</span>
        <span className="game-code">{spaced(game.code)}</span>
        <span className="game-code-about">{describe(game.settings, game.total)}</span>
        <button
          className="btn btn-primary btn-icon game-share"
          onClick={() => {
            haptic("medium");
            share(inviteMessage({ code: game.code, about: describe(game.settings, game.total), link }));
          }}
        >
          Share invite
        </button>
      </div>

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>Players</span>
        <span className="game-count">{here.length} / {MAX_PLAYERS}</span>
      </div>
      <div className="board">
        {game.players.map((p) => (
          <div key={p.pid} className={`board-row${p.pid === game.you ? " me" : ""}${p.connected ? "" : " away"}`}>
            <PlayerName p={p} you={game.you} host={game.host} />
            {!p.connected && <span className="game-away">away</span>}
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
              Start game
            </button>
            <div className="cta-note">
              {here.length < MIN_PLAYERS
                ? "Waiting for at least one more player — share the invite."
                : game.settings.qtype === "binary"
                  ? `Right and fast earns up to ${maxPoints("binary").toLocaleString()} a question. Wrong earns 0.`
                  : `Right and fast earns up to ${maxPoints("binary").toLocaleString()} tapped, ${maxPoints("gap").toLocaleString()} typed. Wrong earns 0.`}
            </div>
          </>
        ) : (
          <div className="game-wait">Waiting for {host?.name || "the host"} to start…</div>
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
        <div className="game-ready-n">Question {game.index + 1}</div>
        <div className="game-ready-c">{Math.ceil((game.opensAt - now) / 1000)}</div>
        <div className="sub">{typeName(q.type === "gap" ? "gap" : "binary")} · {game.settings.seconds} seconds</div>
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
        <button className="q-img" onClick={() => setZoom(true)} aria-label="Enlarge picture">
          <img src={`${import.meta.env.BASE_URL}img/${q.img}`} alt="" />
          <span className="q-img-hint">tap to enlarge</span>
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
            placeholder="Type your answer…"
            disabled={answered || timeUp}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            enterKeyHint="send"
          />
          {!answered && !timeUp && (
            <button className="btn btn-primary" style={{ marginTop: 12 }} disabled={!typed.trim()}>Answer</button>
          )}
        </form>
      )}

      <div className="game-status">
        {answered
          ? `✓ Answer in · ${answeredCount} of ${here} answered`
          : timeUp
            ? "⏱ Time’s up"
            : `${answeredCount} of ${here} answered`}
      </div>

      {zoom && q.img && (
        <div className="zoom" onClick={() => setZoom(false)} role="dialog" aria-label="Picture">
          <img src={`${import.meta.env.BASE_URL}img/${q.img}`} alt="" />
          <button className="zoom-x" aria-label="Close">×</button>
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
  if (me.place === 1) return "🏆 You’re in the lead";
  // Players arrive sorted by score, so the last one ahead is the one to catch.
  const ahead = game.players.filter((p) => p.score > me.score);
  const next = ahead[ahead.length - 1];
  return `You’re ${ordinal(me.place)} · ${(next.score - me.score).toLocaleString()} behind ${next.name}`;
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
          {verdict === "ok" ? "✓ Correct" : verdict === "no" ? "✗ Wrong" : "⏱ No answer"}
        </span>
        <span className="game-result-p">+{(mine?.points || 0).toLocaleString()}</span>
      </div>
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
                  {mine?.given === i && <span className="game-tally-you"> · you</span>}
                </span>
                <span className="game-tally-n">{n}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="game-answer">
          Answer: <b>{answer}</b>
          {tally && <span className="game-explain"> · {tally.right} of {tally.answered} got it</span>}
        </div>
      )}
      {game.solution.explain && <div className="game-answer game-explain">{game.solution.explain}</div>}

      <div className="chips-head board-title">
        <span className="section-label" style={{ margin: 0 }}>Scoreboard</span>
        <span className="game-count">{last ? "Final results" : "Next question"} in {left}</span>
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

  function again() {
    haptic("medium");
    const s = game.settings;
    send({ type: "again", questions: pickGameQuestions(bank, { tags: s.tags, qtype: s.qtype, count: s.count }) });
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
          <span>You finished <b className="game-place">#{mine.place} of {game.players.length}</b></span>
          <b>{mine.score.toLocaleString()} <small>pts</small></b>
        </div>
      )}
      {mine && (
        <div className="cta-note game-final-note">
          {mine.correct} of {game.total} right{game.round > 1 ? ` · round ${game.round}` : ""}
        </div>
      )}

      <div className="section-label">Everyone</div>
      <Standings game={game} top={MAX_PLAYERS} />

      <div className="home-cta">
        {isHost ? (
          <button className="btn btn-primary" onClick={again}>New round</button>
        ) : (
          <div className="game-wait">Waiting for {host?.name || "the host"} to start a new round…</div>
        )}
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={onLeave}>Leave game</button>
      </div>
    </>
  );
}

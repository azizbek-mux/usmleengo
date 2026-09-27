import React, { useEffect, useRef, useState } from "react";
import Logo from "./components/Logo.jsx";
import Home from "./components/Home.jsx";
import Onboarding from "./components/Onboarding.jsx";
import { SettingsSheet } from "./components/Sheet.jsx";
import Quiz from "./components/Quiz.jsx";
import Result from "./components/Result.jsx";
import English from "./components/English.jsx";
import SectionPick from "./components/SectionPick.jsx";
import Rating from "./components/Rating.jsx";
import Performance from "./components/Performance.jsx";
import { quietSync, syncRating } from "./lib/ratingApi.js";
import { loadBank } from "./data/bank.js";
import { resetDeck } from "./lib/deck.js";
import { build, daily } from "./lib/session.js";
import { emptyState, loadLocal, loadRemote, record, reset, save, setCount, setQType, setSection, setSubjects, setTheme, touchStreak } from "./lib/storage.js";
import { userName } from "./lib/telegram.js";
import { applyTheme, watchSystemTheme } from "./lib/theme.js";
import { xpFor } from "./lib/rating.js";

export default function App() {
  const [state, setState] = useState(loadLocal);
  // Reopen wherever they were last. Only the very first run has no answer.
  const [screen, setScreen] = useState(() =>
    loadLocal().section === "english" ? "english" : "home");
  // The bank is fetched, so nothing that reads it may render until it lands.
  const [bankStatus, setBankStatus] = useState("loading");
  const [questions, setQuestions] = useState([]);
  const [label, setLabel] = useState("");
  const [log, setLog] = useState([]);
  const [streakAdvanced, setStreakAdvanced] = useState(false);
  const [sheet, setSheet] = useState(null); // null | "settings"
  // The latest reply from the rating server: the top ten on each board and
  // this player's place. Kept from whichever sync happened last, so the
  // rating screens open with something to show while they fetch afresh.
  const [standings, setStandings] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);

  // The pool a round was built from, so "Another round" can reshuffle the
  // same topic instead of dumping the user back to the daily mix.
  const poolRef = useRef(null);
  // Live mirror of state — the quiz answers fast enough that a stale closure
  // would drop XP between renders.
  const stateRef = useRef(state);
  stateRef.current = state;

  const name = userName();

  // Pull cloud progress once on mount; local was already painted.
  useEffect(() => {
    let alive = true;
    loadRemote(loadLocal()).then((s) => {
      if (!alive) return;
      setState(s);
      // Every player is ranked from their first open: send the score once
      // the progress that will be sent is the settled one, local and cloud.
      keepRanked(s);
    });
    return () => { alive = false; };
  }, []);

  // Repaint when the preference changes, and — while it is "auto" — when the
  // phone's own setting changes under us. main.jsx did the first paint.
  useEffect(() => {
    applyTheme(state.theme);
    if (state.theme !== "auto") return undefined;
    return watchSystemTheme(() => applyTheme("auto"));
  }, [state.theme]);

  /** The rating screens, once a minute while open: send the score, show the board. */
  function refreshStandings() {
    setStandingsLoading(true);
    syncRating(stateRef.current).then((reply) => {
      if (reply) setStandings(reply);
      setStandingsLoading(false);
    });
  }

  /**
   * Keep this player's place on the board current without asking them —
   * after a round, a study session, or opening the app. Sends nothing if the
   * score has not changed.
   */
  function keepRanked(s) {
    quietSync(s).then((reply) => { if (reply) setStandings(reply); });
  }

  // Fetch the question bank once on mount.
  useEffect(() => {
    let alive = true;
    loadBank()
      .then(() => alive && setBankStatus("ready"))
      .catch(() => alive && setBankStatus("error"));
    return () => { alive = false; };
  }, []);

  function start(pool, roundLabel) {
    const seen = stateRef.current.seen;
    const want = stateRef.current.count;
    const qtype = stateRef.current.qtype || "random";
    const next = pool
      ? build(pool, Math.min(want, pool.length), seen, qtype)
      : daily(want, seen, qtype);
    if (!next.length) return;
    poolRef.current = pool;
    setQuestions(next);
    setLabel(roundLabel || "");
    setLog([]);
    setStreakAdvanced(false);
    setScreen("quiz");
  }

  function handleAnswer(question, correct, elapsedMs) {
    const updated = record(stateRef.current, question, correct, elapsedMs);
    stateRef.current = updated;
    setState(updated);
    setLog((l) => [...l, { question, correct }]);
  }

  function finish() {
    const { state: rolled, advanced } = touchStreak(stateRef.current);
    stateRef.current = rolled;
    setState(rolled);
    setStreakAdvanced(advanced);
    save(rolled);
    keepRanked(rolled);
    setScreen("result");
  }

  function persist(updated) {
    stateRef.current = updated;
    setState(updated);
    save(updated);
  }

  function chooseQType(qtype) {
    persist(setQType(stateRef.current, qtype));
  }

  /**
   * Studying anything counts towards the daily streak — it is one habit, not
   * one per section, so a day spent only on flashcards must not break it.
   * touchStreak returns the same object when the day has already been
   * counted, which makes this safe to call on every answer.
   */
  function markStudied() {
    const { state: rolled } = touchStreak(stateRef.current);
    if (rolled !== stateRef.current) {
      persist(rolled);
      keepRanked(rolled);
    }
  }

  /** Move between the two halves, remembering which one they are in. */
  function goSection(section) {
    persist(setSection(stateRef.current, section));
    setScreen(section === "english" ? "english" : "home");
  }

  function resetAll() {
    reset();
    // The flashcard deck lives under its own key, so it has to be told too —
    // "start over" that leaves 8,479 cards scheduled is not starting over.
    resetDeck();
    // Keep the setup answers — reset clears progress, not preferences.
    const fresh = {
      ...emptyState,
      qtype: stateRef.current.qtype,
      section: stateRef.current.section,
      theme: stateRef.current.theme,
    };
    persist(fresh);
    setSheet(null);
  }

  function changeCount(n) {
    persist(setCount(stateRef.current, n));
  }

  function changeSubjects(tags) {
    persist(setSubjects(stateRef.current, tags));
  }

  function changeTheme(theme) {
    persist(setTheme(stateRef.current, theme));
  }

  function quit() {
    save(stateRef.current);
    setScreen("home");
  }

  const xpEarned = log.reduce((sum, l) => sum + xpFor(l.question, l.correct), 0);

  if (bankStatus !== "ready") {
    return (
      <div className="screen boot">
        <Logo size={92} className="boot-mark" />
        {bankStatus === "loading" ? (
          <>
            <div className="boot-sub">Loading questions…</div>
          </>
        ) : (
          <>
            <div className="boot-title">Couldn’t load questions</div>
            <div className="boot-sub">Check your connection and try again.</div>
            <button
              className="btn btn-primary"
              style={{ marginTop: 22, maxWidth: 240 }}
              onClick={() => {
                setBankStatus("loading");
                loadBank()
                  .then(() => setBankStatus("ready"))
                  .catch(() => setBankStatus("error"));
              }}
            >
              Retry
            </button>
          </>
        )}
      </div>
    );
  }

  // First run: which half of the app did they come for?
  if (!state.section) {
    return <SectionPick onChoose={goSection} />;
  }

  // Reached from the menu on the quiz home only: the rating measures quiz
  // work, so Medical English has no way in.
  if (screen === "rating") {
    return (
      <Rating
        state={state}
        standings={standings}
        loading={standingsLoading}
        onRefresh={refreshStandings}
        onBack={() => setScreen("home")}
      />
    );
  }

  if (screen === "performance") {
    return (
      <Performance
        state={state}
        standings={standings}
        onRefresh={refreshStandings}
        onRating={() => setScreen("rating")}
        onBack={() => setScreen("home")}
      />
    );
  }

  // Medical English owns its own data, progress and scheduling — it shares
  // nothing with the quiz but the storage plumbing and the day streak.
  if (screen === "english") {
    return (
      <English
        name={name}
        streak={state.streak}
        theme={state.theme}
        onTheme={changeTheme}
        onHome={() => goSection("quiz")}
        onStudied={markStudied}
      />
    );
  }

  // The quiz half needs a format before it can serve anything. Asked here
  // rather than on launch, so someone who came for the flashcards is never
  // made to answer it.
  if (!state.qtype) {
    return <Onboarding onChoose={chooseQType} />;
  }

  if (screen === "quiz") {
    return (
      <Quiz
        questions={questions}
        label={label}
        onAnswer={handleAnswer}
        onDone={finish}
        onQuit={quit}
      />
    );
  }

  if (screen === "result") {
    return (
      <Result
        log={log}
        label={label}
        xpEarned={xpEarned}
        streak={state.streak}
        streakAdvanced={streakAdvanced}
        // The place on the overall board, once the post-round sync answers —
        // usually well before anyone reaches the share button. Left out if
        // this player is not ranked (outside Telegram, or the server is down).
        rank={standings?.ranked ? standings.me?.overall : null}
        onAgain={() => start(poolRef.current, label)}
        onHome={() => setScreen("home")}
      />
    );
  }

  return (
    <>
      <Home
        state={state}
        name={name}
        onStart={start}
        onCount={changeCount}
        onSubjects={changeSubjects}
        onSettings={() => setSheet("settings")}
        onEnglish={() => goSection("english")}
        onRating={() => setScreen("rating")}
        onPerformance={() => setScreen("performance")}
      />
      {sheet === "settings" && (
        <SettingsSheet
          state={state}
          onQType={chooseQType}
          onTheme={changeTheme}
          onReset={resetAll}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}

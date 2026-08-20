import React, { useEffect, useRef, useState } from "react";
import Home from "./components/Home.jsx";
import Onboarding from "./components/Onboarding.jsx";
import { SettingsSheet, XpSheet } from "./components/Sheet.jsx";
import Quiz from "./components/Quiz.jsx";
import Result from "./components/Result.jsx";
import { loadBank } from "./data/bank.js";
import { build, daily } from "./lib/session.js";
import { emptyState, loadLocal, loadRemote, record, reset, save, setCount, setQType, touchStreak } from "./lib/storage.js";
import { userName } from "./lib/telegram.js";

export default function App() {
  const [state, setState] = useState(loadLocal);
  const [screen, setScreen] = useState("home");
  // The bank is fetched, so nothing that reads it may render until it lands.
  const [bankStatus, setBankStatus] = useState("loading");
  const [questions, setQuestions] = useState([]);
  const [label, setLabel] = useState("");
  const [log, setLog] = useState([]);
  const [streakAdvanced, setStreakAdvanced] = useState(false);
  const [sheet, setSheet] = useState(null); // null | "settings" | "xp"

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
      if (alive) setState(s);
    });
    return () => { alive = false; };
  }, []);

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

  function handleAnswer(question, correct) {
    const updated = record(stateRef.current, question, correct);
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

  function resetAll() {
    reset();
    // Keep the format choice so the user is not asked to set up again.
    const fresh = { ...emptyState, qtype: stateRef.current.qtype };
    persist(fresh);
    setSheet(null);
  }

  function changeCount(n) {
    persist(setCount(stateRef.current, n));
  }

  function quit() {
    save(stateRef.current);
    setScreen("home");
  }

  const xpEarned = log.reduce((sum, l) => sum + (l.correct ? 10 : 2), 0);

  if (bankStatus !== "ready") {
    return (
      <div className="screen boot">
        <div className="boot-mark">💊</div>
        {bankStatus === "loading" ? (
          <>
            <div className="boot-title">USMLE Drops</div>
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
        onSettings={() => setSheet("settings")}
        onXp={() => setSheet("xp")}
      />
      {sheet === "settings" && (
        <SettingsSheet
          state={state}
          onQType={chooseQType}
          onReset={resetAll}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "xp" && <XpSheet state={state} onClose={() => setSheet(null)} />}
    </>
  );
}

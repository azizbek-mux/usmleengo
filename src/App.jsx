import React, { useCallback, useEffect, useRef, useState } from "react";
import Intro from "./components/Intro.jsx";
import Logo from "./components/Logo.jsx";
import Home from "./components/Home.jsx";
import Quiz from "./components/Quiz.jsx";
import Result from "./components/Result.jsx";
import English from "./components/English.jsx";
import Rating from "./components/Rating.jsx";
import Me from "./components/Me.jsx";
import Game from "./components/Game.jsx";
import Classroom from "./components/Classroom.jsx";
import { classCall, classCodeFromParam, fileTokenFromParam, packageRound } from "./lib/classApi.js";
import { TabBar } from "./components/Chrome.jsx";
import { codeFromParam } from "./lib/game.js";
import { quietSync, syncRating } from "./lib/ratingApi.js";
import { loadBank, setBankLanguage } from "./data/bank.js";
import { resetDeck } from "./lib/deck.js";
import { build, daily } from "./lib/session.js";
import { emptyState, isNewPlayer, loadLocal, loadRemote, record, reset, save, setCount, setLanguage, setQType, setSection, setSubjects, setSystems, setTheme, toggleSaved, touchStreak } from "./lib/storage.js";
import { setLang, t } from "./lib/i18n.js";
import { startParam } from "./lib/telegram.js";
import { applyTheme, watchSystemTheme } from "./lib/theme.js";
import { xpFor } from "./lib/rating.js";

export default function App() {
  const [state, setState] = useState(loadLocal);
  // A multiplayer invite link opens the app on that game. Used once: after
  // it, the Play tab opens on its own menu like any other time.
  const [invite, setInvite] = useState(() => codeFromParam(startParam()));
  // A classroom invite link opens the Class tab with its code filled in.
  const [classInvite, setClassInvite] = useState(() => classCodeFromParam(startParam()));
  // A question file sent to the bot opens the Class tab on it.
  const [botFile, setBotFile] = useState(() => fileTokenFromParam(startParam()));
  // The section open along the bottom. Someone who was last in Medical
  // English reopens there; everyone else starts on the quizzes.
  const [tab, setTab] = useState(() =>
    invite ? "play" : classInvite || botFile ? "class" : loadLocal().section === "english" ? "english" : "quiz");
  // A quiz round and its result take the whole screen.
  const [flow, setFlow] = useState(null); // null | "quiz" | "result"
  // A section in the middle of something that wants the whole screen — a
  // flashcard session, a live game — says so, and the tab bar steps aside.
  const [focused, setFocused] = useState(false);
  // The bank is fetched, so nothing that reads it may render until it lands.
  const [bankStatus, setBankStatus] = useState("loading");
  // The language the bank is showing, which catches up with state.lang.
  const [bankLang, setBankLang] = useState("en");
  const [questions, setQuestions] = useState([]);
  const [label, setLabel] = useState("");
  const [log, setLog] = useState([]);
  const [streakAdvanced, setStreakAdvanced] = useState(false);
  // The latest reply from the rating server: the top ten on each board and
  // this player's place. Kept from whichever sync happened last, so the
  // rating screens open with something to show while they fetch afresh.
  const [standings, setStandings] = useState(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  // The how-to cards: over everything, for a first visit or from Me.
  const [intro, setIntro] = useState(false);

  // The pool a round was built from, so "Another round" can reshuffle the
  // same topic instead of dumping the user back to the daily mix. It may be
  // a function that builds the pool: Mistakes is re-read each round, so
  // questions fixed in the last one are not served again.
  const poolRef = useRef(null);
  // A round of a teacher's questions: what it was built from, the homework it
  // hands in (if any), and the answers given. It counts for nothing — no XP,
  // no streak, no rating, no question history.
  const classRound = useRef(null);
  const [classNote, setClassNote] = useState(null);
  // Live mirror of state — the quiz answers fast enough that a stale closure
  // would drop XP between renders.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Pull cloud progress once on mount; local was already painted.
  useEffect(() => {
    let alive = true;
    loadRemote(loadLocal()).then((s) => {
      if (!alive) return;
      setState(s);
      // A first visit gets the how-to cards — decided only now, once the
      // cloud copy has had its say, so progress from another phone counts.
      // Not when an invite brought them: that visit has a job to do, and the
      // cards wait for the next one.
      if (isNewPlayer(s) && !invite && !classInvite && !botFile) setIntro(true);
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

  // Fetch the question bank once on mount — in Uzbek straight away for a
  // player who chose it, so the first screen is not English for a moment.
  useEffect(() => {
    let alive = true;
    loadBank()
      .then(() => (loadLocal().lang === "uz" ? setBankLanguage("uz").then(() => alive && setBankLang("uz")).catch(() => {}) : null))
      .then(() => alive && setBankStatus("ready"))
      .catch(() => alive && setBankStatus("error"));
    return () => { alive = false; };
  }, []);

  // A language chosen later — on the first how-to card, in Me, or arriving
  // with the cloud copy of progress — turns the bank over too. If the Uzbek
  // file can't be fetched the questions stay English, and it is tried again
  // on the next change.
  useEffect(() => {
    if (bankStatus !== "ready") return;
    const want = state.lang === "uz" ? "uz" : "en";
    if (want === bankLang) return;
    let alive = true;
    setBankLanguage(want).then(() => alive && setBankLang(want)).catch(() => {});
    return () => { alive = false; };
  }, [bankStatus, state.lang, bankLang]);

  /** Start a round. Returns false when there was nothing to ask. */
  function start(source, roundLabel) {
    const seen = stateRef.current.seen;
    const want = stateRef.current.count;
    const qtype = stateRef.current.qtype || "random";
    const pool = typeof source === "function" ? source(stateRef.current) : source;
    const next = pool
      ? build(pool, Math.min(want, pool.length), seen, qtype)
      : daily(want, seen, qtype);
    if (!next.length) return false;
    poolRef.current = source;
    setQuestions(next);
    setLabel(roundLabel || "");
    setLog([]);
    setStreakAdvanced(false);
    setFlow("quiz");
    return true;
  }

  /** A round of a class package: homework (handed in at the end) or practice. */
  function startClass({ questions: source, label: roundLabel, assignmentId = null }) {
    const round = packageRound(source);
    if (!round.length) return;
    classRound.current = { source, assignmentId, answers: {} };
    setQuestions(round);
    setLabel(roundLabel || "");
    setLog([]);
    setStreakAdvanced(false);
    setClassNote(null);
    setFlow("quiz");
  }

  function flipSaved(id) {
    persist(toggleSaved(stateRef.current, id));
  }

  function handleAnswer(question, correct, elapsedMs, chosen) {
    if (classRound.current) {
      // Handed in as the teacher wrote it: the option's own index, not its
      // shuffled place on this screen; or the text typed.
      classRound.current.answers[question.id] = question.type === "gap"
        ? String(chosen ?? "")
        : question.order ? question.order[chosen] : chosen;
      setLog((l) => [...l, { question, correct }]);
      return;
    }
    const updated = record(stateRef.current, question, correct, elapsedMs);
    stateRef.current = updated;
    setState(updated);
    setLog((l) => [...l, { question, correct }]);
  }

  function finish() {
    if (classRound.current) {
      const round = classRound.current;
      if (round.assignmentId) {
        setClassNote(t("Handing it in…", "Topshirilmoqda…"));
        classCall("attempt", { assignmentId: round.assignmentId, answers: round.answers })
          .then((r) => setClassNote(r.first
            ? t(`Handed in: ${r.score}/${r.total}${r.late ? " (late)" : ""}. Your teacher can see it.`,
              `Topshirildi: ${r.score}/${r.total}${r.late ? " (kechikib)" : ""}. O'qituvchingiz buni ko'ra oladi.`)
            : t(`Your first try is the one that counts (${r.score}/${r.total}). This one was practice.`,
              `Faqat birinchi urinish hisoblanadi (${r.score}/${r.total}). Bu safargisi mashq edi.`)))
          .catch(() => setClassNote(t("Couldn’t hand it in. Check your internet, then do it again from the class.",
            "Topshirib bo'lmadi. Internetni tekshiring va sinfdan qaytadan bajaring.")));
        // Anything after this, from the same screen, is practice.
        round.assignmentId = null;
      } else {
        setClassNote(t("Practice — it isn’t counted anywhere.", "Mashq — hech qayerda hisoblanmaydi."));
      }
      setFlow("result");
      return;
    }
    const { state: rolled, advanced } = touchStreak(stateRef.current);
    stateRef.current = rolled;
    setState(rolled);
    setStreakAdvanced(advanced);
    save(rolled);
    keepRanked(rolled);
    setFlow("result");
  }

  function persist(updated) {
    stateRef.current = updated;
    setState(updated);
    save(updated);
  }

  // Skipped or finished, the cards are seen, on every phone (it rides in the saved progress).
  const closeIntro = useCallback(() => {
    setIntro(false);
    if (!stateRef.current.introSeen) persist({ ...stateRef.current, introSeen: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  function openTab(next) {
    // Each section reports its own need for the whole screen as it opens.
    setFocused(false);
    // The two study sections are remembered, so the app reopens on the one
    // last used.
    if (next === "quiz" || next === "english") persist(setSection(stateRef.current, next));
    // An invite is for one visit to the Play tab, not every one after it.
    if (tab === "play") setInvite(null);
    if (tab === "class") { setClassInvite(null); setBotFile(null); }
    setTab(next);
  }

  function resetAll() {
    reset();
    // The flashcard deck lives under its own key, so it has to be told too —
    // "start over" that leaves 8,479 cards scheduled is not starting over.
    resetDeck();
    // Keep the preferences — reset clears progress, not choices. Saved
    // questions are the player's own notes, not progress, and stay too.
    persist({
      ...emptyState,
      saved: stateRef.current.saved,
      qtype: stateRef.current.qtype,
      count: stateRef.current.count,
      section: stateRef.current.section,
      theme: stateRef.current.theme,
      introSeen: stateRef.current.introSeen,
      lang: stateRef.current.lang,
    });
  }

  function quit() {
    if (!classRound.current) save(stateRef.current);
    classRound.current = null;
    setFlow(null);
  }

  // Every screen below reads the language through t(); set it before they render.
  setLang(state.lang);
  const chooseLang = (next) => persist(setLanguage(stateRef.current, next));

  const xpEarned = log.reduce((sum, l) => sum + xpFor(l.question, l.correct), 0);

  if (bankStatus !== "ready") {
    return (
      <div className="screen boot">
        <Logo size={92} className="boot-mark" />
        {bankStatus === "loading" ? (
          <div className="boot-sub">{t("Loading questions…", "Savollar yuklanmoqda…")}</div>
        ) : (
          <>
            <div className="boot-title">{t("Couldn’t load questions", "Savollarni yuklab bo'lmadi")}</div>
            <div className="boot-sub">{t("Check your connection and try again.", "Internetni tekshirib, qayta urinib ko'ring.")}</div>
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
              {t("Retry", "Qayta urinish")}
            </button>
          </>
        )}
      </div>
    );
  }

  if (flow === "quiz") {
    return (
      <Quiz
        questions={questions}
        label={label}
        saved={state.saved}
        onSave={classRound.current ? undefined : flipSaved}
        onAnswer={handleAnswer}
        onDone={finish}
        onQuit={quit}
      />
    );
  }

  if (flow === "result") {
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
        saved={state.saved}
        onSave={classRound.current ? undefined : flipSaved}
        classNote={classRound.current ? classNote || "" : null}
        // Nothing left to ask — every mistake fixed, say — goes back to the tab.
        onAgain={() => {
          if (classRound.current) startClass({ questions: classRound.current.source, label });
          else if (!start(poolRef.current, label)) setFlow(null);
        }}
        onHome={() => { classRound.current = null; setFlow(null); }}
      />
    );
  }

  let screen;
  if (tab === "english") {
    // Medical English owns its own data, progress and scheduling — it
    // shares nothing with the quiz but the storage plumbing and the streak.
    screen = <English streak={state.streak} onStudied={markStudied} onFocus={setFocused} />;
  } else if (tab === "play") {
    screen = <Game invite={invite} onFocus={setFocused} />;
  } else if (tab === "class") {
    screen = (
      <Classroom state={state} invite={classInvite} botFile={botFile} onFocus={setFocused} onStartClass={startClass} />
    );
  } else if (tab === "rating") {
    screen = (
      <Rating state={state} standings={standings} loading={standingsLoading} onRefresh={refreshStandings} />
    );
  } else if (tab === "me") {
    screen = (
      <Me
        state={state}
        standings={standings}
        onRefresh={refreshStandings}
        onRating={() => openTab("rating")}
        onTheme={(theme) => persist(setTheme(stateRef.current, theme))}
        onReset={resetAll}
        onHowTo={() => setIntro(true)}
        onLang={chooseLang}
      />
    );
  } else {
    screen = (
      <Home
        state={state}
        onStart={start}
        onFocus={setFocused}
        onCount={(n) => persist(setCount(stateRef.current, n))}
        onQType={(qtype) => persist(setQType(stateRef.current, qtype))}
        onSubjects={(ids) => persist(setSubjects(stateRef.current, ids))}
        onSystems={(ids) => persist(setSystems(stateRef.current, ids))}
      />
    );
  }

  return (
    <>
      {/* Keyed by language, so a switch redraws every screen in the new one. */}
      <div key={`${state.lang || "en"}-${bankLang}`} className={`shell${focused ? "" : " with-tabs"}`}>
        {screen}
        {!focused && <TabBar tab={tab} onTab={openTab} />}
      </div>
      {/* Outside the keyed part: choosing a language on the first card
          re-renders the cards in it without starting them over. */}
      {intro && <Intro onDone={closeIntro} askLang={!state.introSeen} lang={state.lang} onLang={chooseLang} />}
    </>
  );
}

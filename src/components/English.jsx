import React, { useEffect, useMemo, useState } from "react";
import cards, { findCards, loadGlossary } from "../data/glossary.js";
import { GLOSSARY_COUNT } from "../data/glossary-version.js";
import {
  answerCard,
  flushDeck,
  loadDeckLocal,
  loadDeckRemote,
  nextCard,
  queueCounts,
  rollDay,
  saveDeck,
  setConfig,
  stateOf,
} from "../lib/deck.js";
import { GRADES, formatInterval, preview } from "../lib/srs.js";
import { Sheet } from "./Sheet.jsx";
import { haptic } from "../lib/telegram.js";

const GRADE_NAME = { again: "Again", hard: "Hard", good: "Good", easy: "Easy" };

const Back = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
       strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const Gear = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const PRESET_NEW = [5, 10, 20, 40, 100];
const PRESET_REV = [50, 100, 200, 500, 9999];

function OptionsSheet({ config, counts, onChange, onReset, onClose }) {
  return (
    <Sheet title="Deck options" onClose={onClose}>
      <div className="section-label" style={{ marginTop: 4 }}>New cards per day</div>
      <div className="count-presets">
        {PRESET_NEW.map((n) => (
          <button
            key={n}
            className={`preset${config.newPerDay === n ? " on" : ""}`}
            onClick={() => { haptic("light"); onChange({ newPerDay: n }); }}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="cta-note" style={{ textAlign: "left", marginTop: 8 }}>
        How many words you meet for the first time each day. Every one comes
        back several more times, so 20 new is closer to 60 cards of work.
      </div>

      <div className="section-label">Maximum reviews per day</div>
      <div className="count-presets">
        {PRESET_REV.map((n) => (
          <button
            key={n}
            className={`preset${config.revPerDay === n ? " on" : ""}`}
            onClick={() => { haptic("light"); onChange({ revPerDay: n }); }}
          >
            {n === 9999 ? "∞" : n}
          </button>
        ))}
      </div>
      <div className="cta-note" style={{ textAlign: "left", marginTop: 8 }}>
        A ceiling for days when a backlog has built up.
        {counts.reviewBacklog > 0 && ` You have ${counts.reviewBacklog.toLocaleString()} waiting.`}
      </div>

      <div className="section-label">This deck</div>
      <div className="stat-grid">
        <div className="mini"><b>{counts.seen.toLocaleString()}</b><span>studied</span></div>
        <div className="mini"><b>{counts.known.toLocaleString()}</b><span>mature</span></div>
        <div className="mini"><b>{counts.total.toLocaleString()}</b><span>in deck</span></div>
      </div>

      <button className="btn btn-danger" onClick={onReset}>Reset this deck</button>
      <div className="cta-note">
        Forgets every card’s schedule in Medical English. Your quiz progress is
        untouched. Cannot be undone.
      </div>
    </Sheet>
  );
}

/** One card, front then back, with Anki's four answer buttons. */
function Studying({ card, state, shown, counts, onShow, onRate, onQuit }) {
  const ivls = useMemo(() => (shown ? preview(state) : null), [shown, state]);

  return (
    <div className="screen">
      <div className="quiz-top">
        <button className="close" onClick={onQuit} aria-label="Back to deck"><Back /></button>
        <div className="lane-counts">
          <span className="lane new">{counts.newCount}</span>
          <span className="lane learn">{counts.learnCount}</span>
          <span className="lane due">{counts.dueCount}</span>
        </div>
      </div>

      <div className="card-face" key={`${card.i}-${shown}`}>
        {!shown ? (
          <button className="card-front" onClick={onShow}>
            {card.yield === "high" && (
              <div className="card-tags"><span className="card-tag hi">high yield</span></div>
            )}
            <div className="card-term">{card.term}</div>
            {card.ipa && <div className="card-ipa">{card.ipa}</div>}
            <div className="card-hint">Tap to see the meaning</div>
          </button>
        ) : (
          <div className="card-back">
            {/* Wrapped and centred with `margin: auto` rather than
                justify-content: center — a centred flex column clips its own
                top once the content is tall enough to scroll. */}
            <div className="card-back-in">
              <div className="card-term small">{card.term}</div>
              {card.ipa && <div className="card-ipa">{card.ipa}</div>}
              <div className="card-uz">{card.uz}</div>
              <div className="card-def">{card.def}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card-foot">
        {shown ? (
          <div className="rate-row">
            {GRADES.map((g) => (
              <button key={g} className={`rate ${g}`} onClick={() => onRate(g)}>
                <span className="rate-i">{formatInterval(ivls[g])}</span>
                <span className="rate-n">{GRADE_NAME[g]}</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={onShow}>Show meaning</button>
        )}
      </div>
    </div>
  );
}

export default function English({ onHome }) {
  const [status, setStatus] = useState(() => (cards.length ? "ready" : "loading"));
  const [deck, setDeck] = useState(() => rollDay(loadDeckLocal()));
  const [highOnly, setHighOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(false);

  const [studying, setStudying] = useState(false);
  const [current, setCurrent] = useState(null);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);

  useEffect(() => {
    let alive = true;
    loadGlossary()
      .then(() => alive && setStatus("ready"))
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    loadDeckRemote(loadDeckLocal()).then((d) => alive && setDeck(rollDay(d)));
    return () => { alive = false; };
  }, []);

  // The cloud write is debounced, so leaving the section has to push it.
  useEffect(() => () => { flushDeck(); }, []);

  const pool = useMemo(() => {
    if (status !== "ready") return [];
    return highOnly ? cards.filter((c) => c.yield === "high") : cards;
  }, [status, highOnly]);

  const counts = useMemo(
    () => (status === "ready" ? queueCounts(deck, pool) : null),
    [status, pool, deck],
  );

  const hits = useMemo(
    () => (status === "ready" && query.trim() ? findCards(query) : []),
    [status, query],
  );

  function persist(next) {
    setDeck(next);
    saveDeck(next);
  }

  function advance(fromDeck) {
    const next = nextCard(fromDeck, pool);
    if (!next) { setStudying(false); setCurrent(null); flushDeck(); return; }
    setCurrent(next);
    setShown(false);
  }

  function start() {
    const rolled = rollDay(deck);
    const first = nextCard(rolled, pool);
    if (!first) return;
    haptic("medium");
    setDeck(rolled);
    setDone(0);
    setStudying(true);
    setCurrent(first);
    setShown(false);
  }

  function onRate(grade) {
    haptic(grade === "again" ? "warning" : "light");
    const next = answerCard(deck, current.i, grade);
    persist(next);
    setDone((d) => d + 1);
    advance(next);
  }

  function quitStudy() {
    setStudying(false);
    setCurrent(null);
    flushDeck();
  }

  /* ── loading and failure ─────────────────────────────────────────────── */

  if (status !== "ready") {
    return (
      <div className="screen">
        <div className="quiz-top">
          <button className="close" onClick={onHome} aria-label="Back"><Back /></button>
          <div className="sec-title">Medical English</div>
        </div>
        <div className="empty" style={{ marginTop: 60 }}>
          {status === "loading" ? (
            <>
              <div className="empty-big">📖</div>
              <div>Loading {GLOSSARY_COUNT.toLocaleString()} terms…</div>
              <div className="sub" style={{ marginTop: 6 }}>First time only — it is cached after this.</div>
            </>
          ) : (
            <>
              <div className="empty-big">😕</div>
              <div>Couldn’t load the glossary.</div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 20, maxWidth: 240, marginInline: "auto" }}
                onClick={() => { setStatus("loading"); loadGlossary().then(() => setStatus("ready")).catch(() => setStatus("error")); }}
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── studying ────────────────────────────────────────────────────────── */

  if (studying && current) {
    return (
      <Studying
        card={current}
        state={stateOf(deck, current.i)}
        shown={shown}
        counts={counts}
        onShow={() => { haptic("light"); setShown(true); }}
        onRate={onRate}
        onQuit={quitStudy}
      />
    );
  }

  /* ── deck screen ─────────────────────────────────────────────────────── */

  // The counters can be non-zero while every learning card is still minutes
  // away, so the button asks whether a card can be served right now.
  const canStudy = counts.readyNow > 0;
  const waiting = counts.newCount + counts.learnCount + counts.dueCount;

  return (
    <div className="screen">
      <div className="quiz-top">
        <button className="close" onClick={onHome} aria-label="Back"><Back /></button>
        <div className="sec-title">Medical English</div>
        <button className="deck-gear" onClick={() => setOptions(true)} aria-label="Deck options">
          <Gear />
        </button>
      </div>

      {done > 0 && (
        <div className="done-note">
          {done} card{done > 1 ? "s" : ""} answered.
          {waiting > 0 ? " More are waiting." : " Nothing left due today."}
        </div>
      )}

      <div className="deck-stats">
        <div className="deck-stat">
          <div className="deck-v new">{counts.newCount.toLocaleString()}</div>
          <div className="deck-l">new</div>
        </div>
        <div className="deck-stat">
          <div className="deck-v learn">{counts.learnCount.toLocaleString()}</div>
          <div className="deck-l">learning</div>
        </div>
        <div className="deck-stat">
          <div className="deck-v due">{counts.dueCount.toLocaleString()}</div>
          <div className="deck-l">to review</div>
        </div>
      </div>

      <div className="deck-bar">
        <div className="deck-bar-fill" style={{ width: `${(counts.seen / counts.total) * 100}%` }} />
      </div>
      <div className="deck-bar-note">
        {counts.seen.toLocaleString()} of {counts.total.toLocaleString()} studied
        {counts.known > 0 && ` · ${counts.known.toLocaleString()} mature`}
      </div>

      <div className="search" style={{ marginTop: 18 }}>
        <span className="search-icon"><SearchIcon /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Look up a word — EN yoki UZ"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
      </div>

      {query.trim() ? (
        hits.length ? (
          <div className="results" style={{ marginTop: 14 }}>
            {hits.slice(0, 12).map((c) => (
              <div key={c.i} className="look-row">
                <div className="look-en">{c.term}</div>
                {c.ipa && <div className="look-ipa">{c.ipa}</div>}
                <div className="look-uz">{c.uz}</div>
                <div className="look-def">{c.def}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty"><div>Nothing for “{query.trim()}”.</div></div>
        )
      ) : (
        <button
          className={`deck-toggle${highOnly ? " on" : ""}`}
          onClick={() => { haptic("light"); setHighOnly((v) => !v); }}
          aria-pressed={highOnly}
        >
          <span>
            <span className="deck-toggle-t">High yield only</span>
            <span className="deck-toggle-n">
              {highOnly
                ? `Showing the ${pool.length.toLocaleString()} highest-yield terms`
                : `Studying all ${cards.length.toLocaleString()} terms`}
            </span>
          </span>
          <span className="switch"><span className="knob" /></span>
        </button>
      )}

      <div className="home-cta">
        <button className="btn btn-primary" onClick={start} disabled={!canStudy}>
          {canStudy ? "Study now" : waiting > 0 ? "Next card in a few minutes" : "Finished for today"}
        </button>
        <div className="cta-note">
          {waiting > 0
            ? `${waiting.toLocaleString()} card${waiting > 1 ? "s" : ""} to go today`
            : counts.newRemaining > 0
              ? `${counts.newRemaining.toLocaleString()} new words waiting for tomorrow`
              : "Every card here is scheduled for a later day"}
          {counts.newLimited && waiting > 0 && ` · ${deck.config.newPerDay} new a day`}
        </div>
      </div>

      {options && (
        <OptionsSheet
          config={deck.config}
          counts={counts}
          onChange={(patch) => persist(setConfig(deck, patch))}
          onReset={() => {
            const fresh = { ...deck, cards: {}, newDone: 0, revDone: 0, reviews: 0 };
            persist(fresh);
            flushDeck();
            setOptions(false);
          }}
          onClose={() => { setOptions(false); flushDeck(); }}
        />
      )}
    </div>
  );
}

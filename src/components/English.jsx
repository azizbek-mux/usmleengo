import React, { useEffect, useMemo, useState } from "react";
import cards, { findCards, loadGlossary } from "../data/glossary.js";
import { GLOSSARY_COUNT } from "../data/glossary-version.js";
import {
  buildRound,
  deckStats,
  loadDeckLocal,
  loadDeckRemote,
  rate,
  saveDeck,
} from "../lib/deck.js";
import { haptic } from "../lib/telegram.js";

// What each button does to the schedule, shown on the button itself so the
// choice is informed rather than a guess — the one piece of Anki's interface
// that genuinely teaches you how the system works.
const NEXT_LABEL = { again: "today", good: "sooner", easy: "later" };

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

/** One card, front then back. */
function Card({ card, shown, onShow, onRate }) {
  return (
    <>
      <div className={`card-face${shown ? " flipped" : ""}`} key={`${card.i}-${shown}`}>
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
            {["again", "good", "easy"].map((g) => (
              <button key={g} className={`rate ${g}`} onClick={() => onRate(g)}>
                <span className="rate-n">{g === "again" ? "Again" : g === "good" ? "Good" : "Easy"}</span>
                <span className="rate-i">{NEXT_LABEL[g]}</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={onShow}>Show meaning</button>
        )}
      </div>
    </>
  );
}

export default function English({ count, onHome }) {
  const [status, setStatus] = useState(() => (cards.length ? "ready" : "loading"));
  const [deck, setDeck] = useState(loadDeckLocal);
  const [highOnly, setHighOnly] = useState(false);
  const [query, setQuery] = useState("");

  const [round, setRound] = useState(null);   // null = deck screen
  const [at, setAt] = useState(0);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);

  // Fetch the glossary the first time this section is opened.
  useEffect(() => {
    let alive = true;
    loadGlossary()
      .then(() => alive && setStatus("ready"))
      .catch(() => alive && setStatus("error"));
    return () => { alive = false; };
  }, []);

  // Pull cloud progress once; the local copy was already painted.
  useEffect(() => {
    let alive = true;
    loadDeckRemote(loadDeckLocal()).then((d) => alive && setDeck(d));
    return () => { alive = false; };
  }, []);

  const pool = useMemo(() => {
    if (status !== "ready") return [];
    return highOnly ? cards.filter((c) => c.yield === "high") : cards;
  }, [status, highOnly]);

  const stats = useMemo(
    () => (status === "ready" ? deckStats(pool, deck) : null),
    [status, pool, deck],
  );

  const hits = useMemo(
    () => (status === "ready" && query.trim() ? findCards(query) : []),
    [status, query],
  );

  // How many cards the next round can actually serve.
  const take = stats ? Math.min(count, stats.available) : 0;

  function persist(next) {
    setDeck(next);
    saveDeck(next);
  }

  function start() {
    const next = buildRound(pool, deck, count);
    if (!next.length) return;
    haptic("medium");
    setRound(next);
    setAt(0);
    setShown(false);
    setDone(0);
  }

  function onRate(grade) {
    haptic(grade === "again" ? "warning" : "light");
    persist(rate(deck, round[at].i, grade));
    setDone((d) => d + 1);
    if (at + 1 >= round.length) setRound(null);
    else { setAt(at + 1); setShown(false); }
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

  if (round) {
    const card = round[at];
    return (
      <div className="screen">
        <div className="quiz-top">
          <button className="close" onClick={() => setRound(null)} aria-label="End session"><Back /></button>
          <div className="bar">
            <div className="bar-fill" style={{ width: `${(at / round.length) * 100}%` }} />
          </div>
          <div className="combo">{at + 1}/{round.length}</div>
        </div>
        <Card card={card} shown={shown} onShow={() => { haptic("light"); setShown(true); }} onRate={onRate} />
      </div>
    );
  }

  /* ── deck screen ─────────────────────────────────────────────────────── */

  return (
    <div className="screen">
      <div className="quiz-top">
        <button className="close" onClick={onHome} aria-label="Back"><Back /></button>
        <div className="sec-title">Medical English</div>
      </div>

      {done > 0 && (
        <div className="done-note">
          {done} card{done > 1 ? "s" : ""} reviewed. {take > 0 ? "More are waiting." : "That is everything for today."}
        </div>
      )}

      <div className="deck-stats">
        <div className="deck-stat">
          <div className="deck-v accent">{stats.due.toLocaleString()}</div>
          <div className="deck-l">to review</div>
        </div>
        <div className="deck-stat">
          <div className="deck-v">{stats.learning.toLocaleString()}</div>
          <div className="deck-l">learning</div>
        </div>
        <div className="deck-stat">
          <div className="deck-v gold">{stats.known.toLocaleString()}</div>
          <div className="deck-l">known</div>
        </div>
      </div>

      <div className="deck-bar">
        <div className="deck-bar-fill" style={{ width: `${(stats.studied / stats.total) * 100}%` }} />
      </div>
      <div className="deck-bar-note">
        {stats.studied.toLocaleString()} of {stats.total.toLocaleString()} seen
        {highOnly ? " in high yield" : ""}
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
        <button className="btn btn-primary" onClick={start} disabled={!take}>
          {take ? `Study ${take} card${take > 1 ? "s" : ""}` : "Nothing due — come back tomorrow"}
        </button>
        <div className="cta-note">
          {stats.due > 0 && `${stats.due.toLocaleString()} to review`}
          {stats.due > 0 && stats.fresh > 0 && " · "}
          {stats.fresh > 0 && `${stats.fresh.toLocaleString()} new`}
          {!take && "Every card here is scheduled for a later day"}
        </div>
      </div>
    </div>
  );
}

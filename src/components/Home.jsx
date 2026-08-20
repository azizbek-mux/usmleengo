import React, { useMemo, useState } from "react";
import bank, { bankBlurb } from "../data/bank.js";
import { search, suggest, subjects } from "../lib/match.js";
import { haptic } from "../lib/telegram.js";
import { today } from "../lib/storage.js";

const PRESETS = [2, 5, 10, 20, 50, 100];

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
       strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
  </svg>
);

const Arrow = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const Gear = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const Dice = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
  </svg>
);

/** Group flat question hits into one row per topic. */
function byTopic(hits) {
  const map = new Map();
  for (const q of hits) {
    if (!map.has(q.topic)) map.set(q.topic, []);
    map.get(q.topic).push(q);
  }
  return [...map.entries()].map(([topic, questions]) => ({ topic, questions }));
}

export default function Home({ state, name, onStart, onCount, onSettings, onXp }) {
  const [query, setQuery] = useState("");

  const hits = useMemo(() => (query.trim() ? search(query) : []), [query]);
  const groups = useMemo(() => byTopic(hits), [hits]);
  const tips = useMemo(() => (query.trim() && !hits.length ? suggest(query) : []), [query, hits]);
  const chips = useMemo(() => subjects().slice(0, 12), []);

  const count = state.count;
  const accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;

  function launch(pool, label) {
    haptic("medium");
    onStart(pool, label);
  }

  /** A topic may hold fewer questions than the chosen session length. */

  return (
    <div className="screen">
      <div className="home-head">
        <div>
          <div className="greet">
            {name ? <>Hi, <span>{name}</span></> : "usmleengo"}
          </div>
          {/* Bank size stays put once there is progress to show — it is what
              the app offers, not a first-run greeting. Progress goes on its
              own line beneath so neither has to be truncated on a phone. */}
          <div className="sub">{bankBlurb()}</div>
          {state.answered > 0 && (
            <div className="sub sub-progress">
              {state.answered.toLocaleString()} answered · {accuracy}%
            </div>
          )}
        </div>
        <div className="stats">
          <div className="stat flame">
            <div className="stat-v">{state.streak}</div>
            <div className="stat-l">🔥 day</div>
          </div>
          <button className="stat xp tappable" onClick={onXp} aria-label="What is XP?">
            <div className="stat-v">{state.xp}</div>
            <div className="stat-l">XP <span className="qmark">?</span></div>
          </button>
          <button className="stat gear" onClick={onSettings} aria-label="Settings">
            <Gear />
          </button>
        </div>
      </div>

      {/* ── session length ─────────────────────────────────────────────── */}
      <div className="count-box">
        <div className="count-head">
          <span className="section-label" style={{ margin: 0 }}>Questions per session</span>
          <span className="count-value">{count}</span>
        </div>
        <input
          className="count-slider"
          type="range"
          min="2"
          max="100"
          value={count}
          onChange={(e) => onCount(Number(e.target.value))}
          aria-label="Questions per session"
        />
        <div className="count-presets">
          {PRESETS.map((n) => (
            <button
              key={n}
              className={`preset${n === count ? " on" : ""}`}
              onClick={() => { haptic("light"); onCount(n); }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* ── pick a topic ───────────────────────────────────────────────── */}
      <div className="search">
        <span className="search-icon"><SearchIcon /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a topic — addison, niacin, murmur…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="search"
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits.length) {
              e.currentTarget.blur();
              launch(hits, query.trim());
            }
          }}
        />
      </div>

      {query.trim() ? (
        groups.length ? (
          <>
            <div className="section-label">Results</div>
            <div className="results">
              <button className="result-row" onClick={() => launch(hits, query.trim())}>
                <div>
                  <div className="t">Quiz me on “{query.trim()}”</div>
                  <div className="n">Start a round on this</div>
                </div>
                <span className="go"><Arrow /></span>
              </button>
              {groups.slice(0, 8).map((g) => (
                <button key={g.topic} className="result-row" onClick={() => launch(g.questions, g.topic)}>
                  <div>
                    <div className="t">{g.topic}</div>
                    <div className="n">
                      Tap to practise
                    </div>
                  </div>
                  <span className="go"><Arrow /></span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="empty">
            <div className="empty-big">🔍</div>
            <div>Nothing yet for “{query.trim()}”.</div>
            {tips.length > 0 && (
              <>
                <div className="section-label" style={{ textAlign: "left" }}>Did you mean</div>
                <div className="chips">
                  {tips.map((t) => (
                    <button key={t} className="chip" onClick={() => setQuery(t)}>{t}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      ) : (
        <>
          <div className="section-label">Or pick a subject</div>
          <div className="chips">
            {chips.map(({ tag }) => (
              <button key={tag} className="chip" onClick={() => launch(search(tag), tag)}>
                {tag}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── random ─────────────────────────────────────────────────────── */}
      <div className="home-cta">
        <button className="btn btn-primary btn-icon" onClick={() => launch(null, "Random")}>
          <Dice />
          Random · {count} question{count > 1 ? "s" : ""}
        </button>
        <div className="cta-note">
          {state.qtype === "binary" ? "Multiple choice"
            : state.qtype === "gap" ? "Fill the gap"
            : "Mixed question types"}
          {state.lastDay === today() ? " · practised today ✓" : " · from every subject"}
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from "react";
import bank, { bankBlurb } from "../data/bank.js";
import { GLOSSARY_COUNT } from "../data/glossary-version.js";
import AdCard from "./AdCard.jsx";
import MainMenu from "./Menu.jsx";
import { search, suggest, subjects } from "../lib/match.js";
import { haptic } from "../lib/telegram.js";
import { today } from "../lib/storage.js";

const PRESETS = [2, 5, 10, 20, 50, 100];

// Named here rather than derived, because these two are the whole point of the
// picture bank and should keep a fixed order and wording.
const PICTURE_SETS = [
  { tag: "histo", name: "histology" },
  { tag: "radio", name: "radiology" },
];

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

const Book = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

export default function Home({ state, name, onStart, onCount, onSubjects, onSettings, onEnglish, onRating, onPerformance }) {
  const [query, setQuery] = useState("");

  const hits = useMemo(() => (query.trim() ? search(query) : []), [query]);
  const groups = useMemo(() => byTopic(hits), [hits]);
  const tips = useMemo(() => (query.trim() && !hits.length ? suggest(query) : []), [query, hits]);
  const chips = useMemo(() => subjects().slice(0, 12), []);
  // Every question that is a picture, filtered by tag below.
  const pictures = useMemo(() => bank.filter((q) => q.img), []);

  // Chosen categories. Empty means the whole bank, which is why the button
  // still says Random until something is picked.
  const chosen = state.subjects || [];
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const pool = useMemo(
    () => (chosen.length ? bank.filter((q) => q.tags.some((t) => chosenSet.has(t))) : null),
    [chosen, chosenSet],
  );

  function toggle(tag) {
    haptic("light");
    onSubjects(chosenSet.has(tag) ? chosen.filter((t) => t !== tag) : [...chosen, tag]);
  }

  const count = state.count;

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
          {/* What the app offers. The user's own numbers are in My
              performance, behind the menu. */}
          <div className="sub">{bankBlurb()}</div>
        </div>
        {/* Rating, performance and settings: everything about the user rather
            than the studying, behind one button so this screen stays short. */}
        <MainMenu onRating={onRating} onPerformance={onPerformance} onSettings={onSettings} />
      </div>

      <AdCard />

      {/* ── the other half of the app ──────────────────────────────────── */}
      <div className="mode-row">
        <button className="mode" onClick={() => { haptic("light"); onEnglish(); }}>
          <span className="mode-ico"><Book /></span>
          <span>
            <span className="mode-t">Medical English</span>
            <span className="mode-n">{GLOSSARY_COUNT.toLocaleString()} clinical terms · flashcards</span>
          </span>
        </button>
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
          {/* Picture questions are a different axis from body system, and
              there are far fewer of them, so they would never survive the
              cut into the subject row. They get their own row, but share one
              selection with the subjects: picking peds and radiology together
              is a perfectly reasonable way to study. */}
          {pictures.length > 0 && (
            <>
              <div className="section-label">By picture</div>
              <div className="chips">
                {PICTURE_SETS.map(({ tag, name }) => {
                  const n = pictures.filter((q) => q.tags.includes(tag)).length;
                  if (!n) return null;
                  return (
                    <button
                      key={tag}
                      className={`chip${chosenSet.has(tag) ? " on" : ""}`}
                      aria-pressed={chosenSet.has(tag)}
                      onClick={() => toggle(tag)}
                    >
                      {name} <span className="chip-n">{n}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="chips-head">
            <span className="section-label" style={{ margin: 0 }}>By subject</span>
            {chosen.length > 0 && (
              <button className="chips-clear" onClick={() => { haptic("light"); onSubjects([]); }}>
                Clear {chosen.length}
              </button>
            )}
          </div>
          <div className="chips">
            {chips.map(({ tag }) => (
              <button
                key={tag}
                className={`chip${chosenSet.has(tag) ? " on" : ""}`}
                aria-pressed={chosenSet.has(tag)}
                onClick={() => toggle(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── start ──────────────────────────────────────────────────────── */}
      <div className="home-cta">
        <button
          className="btn btn-primary btn-icon"
          disabled={pool !== null && pool.length === 0}
          onClick={() => launch(pool, chosen.length === 1 ? chosen[0] : chosen.length ? `${chosen.length} categories` : "Random")}
        >
          <Dice />
          {chosen.length ? "Start" : "Random"} · {Math.min(count, pool ? pool.length : count)}
          {" "}question{Math.min(count, pool ? pool.length : count) > 1 ? "s" : ""}
        </button>
        <div className="cta-note">
          {state.qtype === "binary" ? "Multiple choice"
            : state.qtype === "gap" ? "Fill the gap"
            : "Mixed question types"}
          {chosen.length
            ? ` · ${chosen.length} of ${chips.length + PICTURE_SETS.length} categories, ${pool.length.toLocaleString()} questions`
            : state.lastDay === today() ? " · practised today ✓" : " · from every subject"}
        </div>
      </div>
    </div>
  );
}

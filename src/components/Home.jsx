import React, { useEffect, useMemo, useState } from "react";
import bank, { bankBlurb } from "../data/bank.js";
import AdCard from "./AdCard.jsx";
import { BackBar, ScreenHead, StreakPill } from "./Chrome.jsx";
import { Bookmark, ChevronDown, Flask, Retry, SearchIcon, Target } from "./Icons.jsx";
import LabValues from "./LabValues.jsx";
import { Sheet } from "./Sheet.jsx";
import { search, suggest } from "../lib/match.js";
import { QTYPES } from "../lib/qtypes.js";
import { MIN_ANSWERS, mistakesIn, progressBy, savedIn } from "../lib/review.js";
import { byFormat } from "../lib/session.js";
import CategoryGroup, { narrow, useCategories } from "./CategoryGroup.jsx";
import { SUBJECTS, SYSTEMS, subjectName, subjectShort, systemName, systemShort } from "../lib/taxonomy.js";
import { t } from "../lib/i18n.js";
import { haptic } from "../lib/telegram.js";
import { today } from "../lib/storage.js";

// The Quiz tab. Laid out the way people use it: find or pick what to study,
// then start. Under the search, Review offers the player's own material —
// their mistakes, their saved questions, their weakest categories. Then the
// categories, one tap each; the two settings that shape a round — how many
// questions, and which kind — sit as small buttons beside Start, which is
// pinned above the tab bar so it never needs scrolling to.

const PRESETS = [2, 5, 10, 20, 50, 100];

/** How each question type reads on its button, short enough to share a row. */
const shortQtype = (id) => ({
  random: t("Mixed", "Aralash"),
  binary: t("Multiple choice", "Test"),
  gap: t("Fill the gap", "Yozma javob"),
})[id];

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

/** Every question in the bank under each topic name. */
function topicIndex(questions) {
  const map = new Map();
  for (const q of questions) {
    if (!map.has(q.topic)) map.set(q.topic, []);
    map.get(q.topic).push(q);
  }
  return map;
}

const questionsLabel = (n) => t(`${n.toLocaleString()} question${n === 1 ? "" : "s"}`, `${n.toLocaleString()} ta savol`);

/** Pool builders for the review rounds, read afresh each round (see App's start). */
const mistakePool = (s) => mistakesIn(bank, s.seen);
const savedPool = (s) => savedIn(bank, s.saved);

export default function Home({ state, onStart, onFocus, onCount, onQType, onSubjects, onSystems }) {
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState(null); // null | "count" | "type"
  const [labs, setLabs] = useState(false); // the normal lab values, over the tab
  const [view, setView] = useState("main"); // main | weak

  // Weak topics is a screen of its own and wants the whole of it. Handed
  // back on the way out too — starting a round from it unmounts this tab.
  useEffect(() => {
    onFocus?.(view === "weak");
    return () => onFocus?.(false);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const hits = useMemo(() => (query.trim() ? search(query) : []), [query]);
  // The search keeps only its forty best matches, so a topic row cannot be
  // built from the hits: a fourteen-question topic with five in the top
  // forty would offer five. The hits choose which topics to list; each row
  // then counts and plays the whole topic.
  const topics = useMemo(() => topicIndex(bank), []);
  const found = useMemo(() => [...new Set(hits.map((q) => q.topic))], [hits]);
  const tips = useMemo(() => (query.trim() && !hits.length ? suggest(query) : []), [query, hits]);

  const groups = useCategories(state.lang);

  // The two chosen lists. Empty means the whole bank on that axis, which is
  // why the button still says Random until something is picked. They are
  // combined with "and": Cardiovascular plus Pharmacology is heart drugs.
  const chosenSystems = state.systems || [];
  const chosen = state.subjects || [];
  const systemSet = useMemo(() => new Set(chosenSystems), [chosenSystems]);
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const picked = chosenSystems.length + chosen.length;
  const pool = useMemo(
    () => (picked ? narrow(bank, chosenSystems, chosen) : null),
    [picked, chosenSystems, chosen],
  );
  const qtype = state.qtype || "random";

  const mistakes = useMemo(() => mistakesIn(bank, state.seen), [state.seen]);
  const savedQs = useMemo(() => savedIn(bank, state.saved), [state.saved]);
  // How the player is doing in each system and each subject: the weak-topics
  // screen lists both, and the tile names the weakest system, or the weakest
  // subject while no system has enough answers to judge.
  const bySystem = useMemo(() => progressBy(bank, state.seen, "system", SYSTEMS.map((x) => x.id)), [state.seen, state.lang]);
  const bySubject = useMemo(() => progressBy(bank, state.seen, "subject", SUBJECTS.map((x) => x.id)), [state.seen, state.lang]);
  const weakestSystem = bySystem.find((r) => r.pct !== null);
  const weakestSubject = bySubject.find((r) => r.pct !== null);

  function toggleSubject(id) {
    haptic("light");
    onSubjects(chosenSet.has(id) ? chosen.filter((c) => c !== id) : [...chosen, id]);
  }

  function toggleSystem(id) {
    haptic("light");
    onSystems(systemSet.has(id) ? chosenSystems.filter((c) => c !== id) : [...chosenSystems, id]);
  }

  function launch(p, label) {
    haptic("medium");
    onStart(p, label);
  }

  /**
   * What the round is called afterwards. One category names itself; a mix
   * is counted, because "Cardiovascular, Renal, Pharmacology" does not fit
   * anywhere it is shown.
   */
  function roundLabel() {
    if (!picked) return t("Random", "Tasodifiy");
    if (picked === 1) return chosenSystems.length ? systemName(chosenSystems[0]) : subjectName(chosen[0]);
    return t(`${picked} categories`, `${picked} ta yo'nalish`);
  }

  /** How many questions a round from this pool can draw, in the chosen format. */
  const usable = (p) => byFormat(p, state.qtype).length;
  const count = state.count;
  const roundSize = Math.min(count, pool ? usable(pool) : count);



  if (view === "weak") {
    return (
      <WeakTopics
        systems={bySystem}
        subjects={bySubject}
        onBack={() => setView("main")}
        onPractise={(kind, ids, label) => {
          const wanted = new Set(ids);
          launch(bank.filter((q) => wanted.has(q[kind])), label);
        }}
      />
    );
  }

  return (
    <div className="screen">
      <ScreenHead title={t("Quizzes", "Testlar")} sub={bankBlurb()} right={<StreakPill days={state.streak} />} />

      <AdCard />

      <div className="search-row">
      <div className="search">
        <span className="search-icon"><SearchIcon /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search a topic — addison, niacin, murmur…", "Mavzu qidiring — Addison, niatsin…")}
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
      <button
        className="lab-btn"
        onClick={() => { haptic("light"); setLabs(true); }}
        aria-label={t("Normal lab values", "Normal laboratoriya ko'rsatkichlari")}
      >
        <Flask size={22} />
      </button>
      </div>

      {query.trim() ? (
        found.length ? (
          <>
            <div className="section-label">{t("Results", "Natijalar")}</div>
            <div className="results">
              <button className="result-row" onClick={() => launch(hits, query.trim())}>
                <div>
                  <div className="t">{t(<>Quiz me on “{query.trim()}”</>, <>«{query.trim()}» bo'yicha test</>)}</div>
                  <div className="n">{t(`${questionsLabel(usable(hits))} matching`, `${usable(hits).toLocaleString()} ta mos savol`)}</div>
                </div>
                <span className="go"><Arrow /></span>
              </button>
              {found.slice(0, 8).map((topic) => {
                const questions = topics.get(topic) || [];
                return (
                  <button key={topic} className="result-row" onClick={() => launch(questions, topic)}>
                    <div>
                      <div className="t">{topic}</div>
                      <div className="n">{questionsLabel(usable(questions))}</div>
                    </div>
                    <span className="go"><Arrow /></span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty">
            <div className="empty-big">🔍</div>
            <div>{t(<>Nothing yet for “{query.trim()}”.</>, <>«{query.trim()}» bo'yicha hech narsa topilmadi.</>)}</div>
            {tips.length > 0 && (
              <>
                <div className="section-label" style={{ textAlign: "left" }}>{t("Did you mean", "Balki shulardir")}</div>
                <div className="chips">
                  {tips.map((tip) => (
                    <button key={tip} className="chip" onClick={() => setQuery(tip)}>{tip}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      ) : (
        <>
          {/* ── review: the player's own material ─────────────────────── */}
          <div className="section-label">{t("Review", "Takrorlash")}</div>
          <div className="review-row">
            <button
              className="review-tile"
              disabled={!mistakes.length}
              onClick={() => launch(mistakePool, t("Mistakes", "Xatolar"))}
            >
              <span className="review-ico"><Retry /></span>
              <span className="review-t">{t("Mistakes", "Xatolar")}</span>
              <span className="review-n">
                {mistakes.length
                  ? t(`${mistakes.length.toLocaleString()} to fix`, `${mistakes.length.toLocaleString()} ta tuzatish kerak`)
                  : t("None — nice", "Yo'q — ajoyib")}
              </span>
            </button>
            <button
              className="review-tile"
              disabled={!savedQs.length}
              onClick={() => launch(savedPool, t("Saved", "Saqlangan"))}
            >
              <span className="review-ico"><Bookmark /></span>
              <span className="review-t">{t("Saved", "Saqlangan")}</span>
              <span className="review-n">
                {savedQs.length
                  ? t(`${savedQs.length.toLocaleString()} saved`, `${savedQs.length.toLocaleString()} ta saqlangan`)
                  : t("Tap 🔖 in a quiz", "🔖 ni bosing")}
              </span>
            </button>
            <button className="review-tile" onClick={() => { haptic("light"); setView("weak"); }}>
              <span className="review-ico"><Target /></span>
              {/* A soft hyphen lets the long Uzbek word break on a narrow phone. */}
              <span className="review-t">{t("Weak topics", "Zaif mavzular")}</span>
              <span className="review-n">
                {weakestSystem ? `${systemShort(weakestSystem.id)} · ${weakestSystem.pct}%`
                  : weakestSubject ? `${subjectShort(weakestSubject.id)} · ${weakestSubject.pct}%`
                    : t("Answer more first", "Javoblar kam")}
              </span>
            </button>
          </div>

          {/* Two independent axes: what the question is about, and what it
              is asked from. Picked together they narrow with "and", which is
              how a student actually revises — the heart, from pharmacology. */}
          <CategoryGroup
            label={t("Systems", "Tizimlar")}
            rows={groups.systems}
            chosen={systemSet}
            onToggle={toggleSystem}
            onAll={() => { haptic("light"); onSystems(groups.systems.map((r) => r.id)); }}
            onNone={() => { haptic("light"); onSystems([]); }}
          />
          <CategoryGroup
            label={t("Subjects", "Fanlar")}
            rows={groups.subjects}
            chosen={chosenSet}
            onToggle={toggleSubject}
            onAll={() => { haptic("light"); onSubjects(groups.subjects.map((r) => r.id)); }}
            onNone={() => { haptic("light"); onSubjects([]); }}
          />
          <div className="bank-sources">
            {t("Sources: UWorld, First Aid, Mehlman PDFs, NBMEs, Free 120s", "Manbalar: UWorld, First Aid, Mehlman PDF fayllari, NBME, Free 120")}
          </div>
        </>
      )}

      {/* ── start, pinned above the tab bar ─────────────────────────────── */}
      <div className="pinned">
        <div className="round-opts">
          <button className="round-opt" onClick={() => { haptic("light"); setPicker("count"); }}>
            {questionsLabel(count)} <ChevronDown />
          </button>
          <button className="round-opt" onClick={() => { haptic("light"); setPicker("type"); }}>
            {shortQtype(qtype)} <ChevronDown />
          </button>
        </div>
        <button
          className="btn btn-primary btn-icon"
          disabled={pool !== null && pool.length === 0}
          onClick={() => launch(pool, roundLabel())}
        >
          <Dice />
          {picked ? t("Start", "Boshlash") : t("Random", "Tasodifiy")} · {questionsLabel(roundSize)}
        </button>
        <div className="cta-note">
          {picked
            ? t(`${roundLabel()} · ${questionsLabel(usable(pool))}`,
                `${roundLabel()} · ${questionsLabel(usable(pool))}`)
            : state.lastDay === today() ? t("Practised today ✓", "Bugun shug'ullandingiz ✓") : t("From every subject", "Barcha fanlardan")}
        </div>
      </div>

      {labs && <LabValues onClose={() => setLabs(false)} />}

      {picker === "count" && (
        <Sheet title={t("Questions per round", "Bir martada nechta savol")} onClose={() => setPicker(null)}>
          <div className="count-presets picker-grid">
            {PRESETS.map((n) => (
              <button
                key={n}
                className={`preset${n === count ? " on" : ""}`}
                onClick={() => { haptic("light"); onCount(n); setPicker(null); }}
              >
                {n}
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {picker === "type" && (
        <Sheet title={t("Question type", "Savol turi")} onClose={() => setPicker(null)}>
          <div className="opt-list">
            {QTYPES().map((type) => (
              <button
                key={type.id}
                className={`opt-row${qtype === type.id ? " on" : ""}`}
                onClick={() => { haptic("light"); onQType(type.id); setPicker(null); }}
              >
                <div>
                  <div className="opt-name">{type.name}</div>
                  <div className="opt-note">{type.note}</div>
                </div>
                <span className="tick">{qtype === type.id ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

/**
 * Weak topics: how the player is doing in every system and every subject,
 * weakest first, from every answer they have given. Each row says how much of
 * the category they have seen and how much of what they answered was right;
 * tapping one practises it, and the button practises the three weakest of the
 * list showing. Categories with too few answers to judge follow the ranked
 * ones, marked "—", rather than being ranked on luck.
 */
function WeakTopics({ systems, subjects, onBack, onPractise }) {
  const [axis, setAxis] = useState("system"); // system | subject
  const rows = axis === "system" ? systems : subjects;
  const name = axis === "system" ? systemName : subjectName;
  const judged = rows.filter((r) => r.pct !== null);
  const worst = judged.slice(0, 3);
  // Those not yet judged follow: the ones they have started first, then by
  // name, so a list of twenty they have not touched can be scanned.
  const ordered = [
    ...judged,
    ...rows.filter((r) => r.pct === null).sort((a, b) => b.seen - a.seen || name(a.id).localeCompare(name(b.id))),
  ];
  const band = (pct) => (pct === null ? "" : pct < 60 ? " low" : pct < 80 ? " mid" : "");

  return (
    <div className="screen">
      <BackBar title={t("Weak topics", "Zaif mavzular")} onBack={onBack} />
      <p className="weak-intro">
        {t("How many questions you have seen, and how many of your answers were right, weakest first. Tap one to practise it.",
          "Nechta savolni ko'rganingiz va javoblaringizning qanchasi to'g'ri bo'lgani, eng zaifidan boshlab. Mashq qilish uchun birini bosing.")}
      </p>

      <div className="period" role="tablist" aria-label={t("Group by", "Guruhlash")}>
        {[["system", t("Systems", "Tizimlar")], ["subject", t("Subjects", "Fanlar")]].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={axis === id}
            className={`period-opt${axis === id ? " on" : ""}`}
            onClick={() => { if (axis !== id) { haptic("light"); setAxis(id); } }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="weak-list">
        {ordered.map((r) => (
          <button key={r.id} className="weak-row stack" onClick={() => onPractise(axis, [r.id], name(r.id))}>
            <span className="weak-name">{name(r.id)}</span>
            <span className={`weak-pct${band(r.pct)}`}>{r.pct === null ? "—" : `${r.pct}%`}</span>
            <span className="weak-bar"><span className={`weak-fill${band(r.pct)}`} style={{ width: `${r.pct ?? 0}%` }} /></span>
            <span className="weak-sub">
              {t(`${r.seen.toLocaleString()} of ${r.total.toLocaleString()} seen · ${r.answered.toLocaleString()} answered`,
                `${r.total.toLocaleString()} tadan ${r.seen.toLocaleString()} tasi ko'rilgan · ${r.answered.toLocaleString()} ta javob`)}
            </span>
          </button>
        ))}
      </div>

      {!judged.length && (
        <div className="cta-note weak-more">
          {t(`Answer at least ${MIN_ANSWERS} questions in one to see how you do in it.`,
            `Natijangizni ko'rish uchun birortasida kamida ${MIN_ANSWERS} ta savolga javob bering.`)}
        </div>
      )}

      {worst.length > 0 && (
        <div className="home-cta">
          <button className="btn btn-primary" onClick={() => onPractise(axis, worst.map((r) => r.id), t("Weak topics", "Zaif mavzular"))}>
            {worst.length === 1
              ? t("Practise my weakest", "Eng zaifini mashq qilish")
              : t(`Practise my ${worst.length} weakest`, `Eng zaif ${worst.length} tasini mashq qilish`)}
          </button>
          <div className="cta-note">{worst.map((r) => name(r.id)).join(", ")}</div>
        </div>
      )}
    </div>
  );
}

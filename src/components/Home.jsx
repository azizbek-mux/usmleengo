import React, { useEffect, useMemo, useState } from "react";
import bank, { bankBlurb } from "../data/bank.js";
import AdCard from "./AdCard.jsx";
import { BackBar, ScreenHead, StreakPill } from "./Chrome.jsx";
import { Bookmark, ChevronDown, Retry, SearchIcon, Target } from "./Icons.jsx";
import { Sheet } from "./Sheet.jsx";
import { search, suggest, subjects } from "../lib/match.js";
import { QTYPES } from "../lib/qtypes.js";
import { MIN_ANSWERS, mistakesIn, savedIn, topicAccuracy } from "../lib/review.js";
import { byFormat } from "../lib/session.js";
import { PICTURE_TAGS, tagLabel } from "../lib/tags.js";
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

export default function Home({ state, onStart, onFocus, onCount, onQType, onSubjects }) {
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState(null); // null | "count" | "type"
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
  const chips = useMemo(() => subjects().slice(0, 12), []);
  const pictureTags = useMemo(() => PICTURE_TAGS.filter((tag) => bank.some((q) => q.img && q.tags.includes(tag))), []);

  // Chosen categories. Empty means the whole bank, which is why the button
  // still says Random until something is picked.
  const chosen = state.subjects || [];
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);
  const pool = useMemo(
    () => (chosen.length ? bank.filter((q) => q.tags.some((tag) => chosenSet.has(tag))) : null),
    [chosen, chosenSet],
  );
  const qtype = state.qtype || "random";

  const mistakes = useMemo(() => mistakesIn(bank, state.seen), [state.seen]);
  const savedQs = useMemo(() => savedIn(bank, state.saved), [state.saved]);
  const accuracy = useMemo(
    () => topicAccuracy(bank, state.seen, [...pictureTags, ...chips.map((c) => c.tag)]),
    [state.seen, pictureTags, chips],
  );
  const weakest = accuracy.find((r) => r.pct !== null);

  function toggle(tag) {
    haptic("light");
    onSubjects(chosenSet.has(tag) ? chosen.filter((c) => c !== tag) : [...chosen, tag]);
  }

  function launch(p, label) {
    haptic("medium");
    onStart(p, label);
  }

  /** How many questions a round from this pool can draw, in the chosen format. */
  const usable = (p) => byFormat(p, state.qtype).length;
  const count = state.count;
  const roundSize = Math.min(count, pool ? usable(pool) : count);

  const chip = (tag) => (
    <button
      key={tag}
      className={`chip${chosenSet.has(tag) ? " on" : ""}`}
      aria-pressed={chosenSet.has(tag)}
      onClick={() => toggle(tag)}
    >
      {tagLabel(tag)}
    </button>
  );

  if (view === "weak") {
    return (
      <WeakTopics
        rows={accuracy}
        onBack={() => setView("main")}
        onPractise={(tags, label) => {
          const wanted = new Set(tags);
          launch(bank.filter((q) => q.tags.some((tag) => wanted.has(tag))), label);
        }}
      />
    );
  }

  return (
    <div className="screen">
      <ScreenHead title={t("Quizzes", "Testlar")} sub={bankBlurb()} right={<StreakPill days={state.streak} />} />

      <AdCard />

      <div className="search">
        <span className="search-icon"><SearchIcon /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search a topic — addison, niacin, murmur…", "Mavzu qidiring — Addison, niatsin, yurak shovqini…")}
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
                  : t("Tap 🔖 in a quiz", "Testda 🔖 ni bosing")}
              </span>
            </button>
            <button className="review-tile" onClick={() => { haptic("light"); setView("weak"); }}>
              <span className="review-ico"><Target /></span>
              <span className="review-t">{t("Weak topics", "Yaxshi o'zlashtirilmagan mavzular")}</span>
              <span className="review-n">{weakest ? `${tagLabel(weakest.tag)} · ${weakest.pct}%` : t("Answer more first", "Avval ko'proq javob bering")}</span>
            </button>
          </div>

          {/* Picture questions are a different axis from body system, and
              there are far fewer of them, so they would never survive the
              cut into the subject row. They get their own row, but share one
              selection with the subjects: picking peds and radio together
              is a perfectly reasonable way to study. */}
          {pictureTags.length > 0 && (
            <>
              <div className="section-label">{t("By picture", "Rasm bo'yicha")}</div>
              <div className="chips">
                {pictureTags.map(chip)}
              </div>
            </>
          )}

          <div className="chips-head">
            <span className="section-label" style={{ margin: 0 }}>{t("By subject", "Fan bo'yicha")}</span>
            {chosen.length > 0 && (
              <button className="chips-clear" onClick={() => { haptic("light"); onSubjects([]); }}>
                {t(`Clear ${chosen.length}`, `Tozalash (${chosen.length})`)}
              </button>
            )}
          </div>
          <div className="chips">
            {chips.map(({ tag }) => chip(tag))}
          </div>
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
          onClick={() => launch(pool, chosen.length === 1
            ? tagLabel(chosen[0])
            : chosen.length ? t(`${chosen.length} categories`, `${chosen.length} ta fan`) : t("Random", "Tasodifiy"))}
        >
          <Dice />
          {chosen.length ? t("Start", "Boshlash") : t("Random", "Tasodifiy")} · {questionsLabel(roundSize)}
        </button>
        <div className="cta-note">
          {chosen.length
            ? t(
              `${chosen.length} of ${chips.length + pictureTags.length} categories · ${questionsLabel(usable(pool))}`,
              `${chips.length + pictureTags.length} tadan ${chosen.length} ta fan · ${questionsLabel(usable(pool))}`,
            )
            : state.lastDay === today() ? t("Practised today ✓", "Bugun shug'ullandingiz ✓") : t("From every subject", "Barcha fanlardan")}
        </div>
      </div>

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
 * Weak topics: accuracy in every category, weakest first, from every answer
 * the player has given. Tapping a category practises it; the button
 * practises the three weakest together. Categories with too few answers to
 * judge are named at the end rather than ranked on luck.
 */
function WeakTopics({ rows, onBack, onPractise }) {
  const judged = rows.filter((r) => r.pct !== null);
  const unjudged = rows.filter((r) => r.pct === null);
  const worst = judged.slice(0, 3);
  const band = (pct) => (pct < 60 ? " low" : pct < 80 ? " mid" : "");

  return (
    <div className="screen">
      <BackBar title={t("Weak topics", "Yaxshi o'zlashtirilmagan mavzular")} onBack={onBack} />
      <p className="weak-intro">
        {t("Your accuracy in each category, weakest first. Tap one to practise it.",
          "Har bir fan bo'yicha to'g'ri javoblaringiz foizi, eng pastidan boshlab. Mashq qilish uchun birini bosing.")}
      </p>

      {judged.length ? (
        <div className="weak-list">
          {judged.map((r) => (
            <button key={r.tag} className="weak-row" onClick={() => onPractise([r.tag], tagLabel(r.tag))}>
              <span className="weak-name">
                {tagLabel(r.tag)}
                <small>{t(`${r.answered.toLocaleString()} answered`, `${r.answered.toLocaleString()} ta javob`)}</small>
              </span>
              <span className="weak-bar"><span className={`weak-fill${band(r.pct)}`} style={{ width: `${r.pct}%` }} /></span>
              <span className={`weak-pct${band(r.pct)}`}>{r.pct}%</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="empty-big">🎯</div>
          <div>
            {t(`Answer at least ${MIN_ANSWERS} questions in a category to see how you do in it.`,
              `Natijangizni ko'rish uchun biror fan bo'yicha kamida ${MIN_ANSWERS} ta savolga javob bering.`)}
          </div>
        </div>
      )}

      {unjudged.length > 0 && (
        <div className="cta-note weak-more">
          {t("Not enough answers yet:", "Hali javoblar yetarli emas:")} {unjudged.map((r) => tagLabel(r.tag)).join(", ")}
        </div>
      )}

      {worst.length > 0 && (
        <div className="home-cta">
          <button className="btn btn-primary" onClick={() => onPractise(worst.map((r) => r.tag), t("Weak topics", "Yaxshi o'zlashtirilmagan mavzular"))}>
            {worst.length === 1
              ? t("Practise my weakest", "Eng zaif mavzuni mashq qilish")
              : t(`Practise my ${worst.length} weakest`, `Eng zaif ${worst.length} ta mavzuni mashq qilish`)}
          </button>
          <div className="cta-note">{worst.map((r) => tagLabel(r.tag)).join(", ")}</div>
        </div>
      )}
    </div>
  );
}

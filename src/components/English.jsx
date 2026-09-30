import React, { useEffect, useMemo, useState } from "react";
import cards, { findCards, loadGlossary } from "../data/glossary.js";
import { GLOSSARY_COUNT } from "../data/glossary-version.js";
import {
  NEW_MAX,
  REV_MAX,
  answerCard,
  flushDeck,
  isConfigured,
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
import AdCard from "./AdCard.jsx";
import { ScreenHead, StreakPill } from "./Chrome.jsx";
import { Byline, Sheet } from "./Sheet.jsx";
import { Gear, SearchIcon } from "./Icons.jsx";
import { t } from "../lib/i18n.js";
import { haptic } from "../lib/telegram.js";

const gradeName = (g) => ({
  again: t("Again", "Qayta"), hard: t("Hard", "Qiyin"), good: t("Good", "Yaxshi"), easy: t("Easy", "Oson"),
})[g];

const Back = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

// "High yield only" is a standing choice about this deck, so it is kept on
// this phone rather than asked again on every visit.
const HIGH_KEY = "usmleengo_english_high";
const readHigh = () => { try { return localStorage.getItem(HIGH_KEY) === "1"; } catch { return false; } };
const writeHigh = (on) => { try { localStorage.setItem(HIGH_KEY, on ? "1" : "0"); } catch { /* a preference */ } };


/**
 * A number the user types rather than picks from a list — any limit is
 * legitimate, and a row of chips cannot offer 39.
 *
 * The field holds its own text while being edited so a half-typed "3" on the
 * way to "39" is not clamped out from under the cursor; the value is only
 * committed on blur or Enter.
 */
function NumberField({ label, value, min, max, unit, onCommit }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);

  // Read the field itself rather than the `text` this render closed over: a
  // keystroke and the blur that follows it can land in the same task, before
  // React has re-rendered, and the closure would then commit the old number.
  const commit = (e) => {
    const raw = e?.target?.value ?? text;
    if (raw === "") { setText(String(value)); return; }
    const clamped = Math.min(max, Math.max(min, Math.round(Number(raw))));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div className="num-field">
      <input
        className="num-input"
        type="text"
        inputMode="numeric"
        value={text}
        aria-label={label}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, String(max).length))}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
      <span className="num-unit">{unit}</span>
    </div>
  );
}

/**
 * Asked once, the first time Medical English is opened. The daily new-card
 * limit is the single number that decides how much work this deck becomes, so
 * it is worth one screen rather than being buried at a default.
 */
function DeckSetup({ onDone }) {
  const [text, setText] = useState("20");
  const n = Number(text);
  const valid = text !== "" && n >= 0 && n <= NEW_MAX;

  return (
    <div className="screen onboard">
      <div className="onboard-top">
        <div className="setup-title">{t("Medical English", "Tibbiy ingliz tili")}</div>
        <p className="onboard-sub">{t("How many new cards a day?", "Kuniga nechta yangi kartochka?")}</p>
      </div>

      <div className="num-hero">
        <input
          className="num-hero-input"
          type="text"
          inputMode="numeric"
          value={text}
          aria-label={t("New cards a day", "Kuniga yangi kartochkalar")}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
        <div className="num-hero-unit">{t("cards a day", "ta kartochka kuniga")}</div>
      </div>

      <div className="setup-note">
        {t("Type any number. Each new word comes back several more times before it sticks, so 20 new is closer to 60 cards of work in a day.",
          "Istalgan sonni yozing. Har bir yangi so'z yodda qolguncha yana bir necha marta qaytadi, shuning uchun 20 ta yangi so'z kuniga taxminan 60 ta kartochka ishini anglatadi.")}
      </div>

      <div className="pinned">
        <button className="btn btn-primary" disabled={!valid} onClick={() => onDone(n)}>
          {t("Start studying", "O'qishni boshlash")}
        </button>
        <div className="cta-note">{t("You can change it anytime under the gear.", "Buni istalgan vaqtda ⚙️ orqali o'zgartirishingiz mumkin.")}</div>
      </div>
    </div>
  );
}

function OptionsSheet({ config, counts, highOnly, highCount, onHighOnly, onChange, onReset, onClose }) {
  return (
    <Sheet title={t("Deck options", "Kartochkalar sozlamalari")} onClose={onClose}>
      <button
        className={`deck-toggle${highOnly ? " on" : ""}`}
        onClick={() => { haptic("light"); onHighOnly(!highOnly); }}
        aria-pressed={highOnly}
      >
        <span>
          <span className="deck-toggle-t">{t("High yield only", "Faqat eng muhim atamalar")}</span>
          <span className="deck-toggle-n">
            {highOnly
              ? t(`Studying the ${highCount.toLocaleString()} highest-yield terms`, `Eng muhim ${highCount.toLocaleString()} ta atama o'rganilmoqda`)
              : t(`Studying all ${counts.total.toLocaleString()} terms`, `Barcha ${counts.total.toLocaleString()} ta atama o'rganilmoqda`)}
          </span>
        </span>
        <span className="switch"><span className="knob" /></span>
      </button>

      <div className="section-label" style={{ marginTop: 4 }}>{t("New cards per day", "Kuniga yangi kartochkalar")}</div>
      <NumberField
        label={t("New cards per day", "Kuniga yangi kartochkalar")}
        value={config.newPerDay ?? 20}
        min={0}
        max={NEW_MAX}
        unit={t("cards a day", "ta kartochka kuniga")}
        onCommit={(n) => onChange({ newPerDay: n })}
      />
      <div className="cta-note" style={{ textAlign: "left", marginTop: 8 }}>
        {t("How many words you meet for the first time each day. Every one comes back several more times, so 20 new is closer to 60 cards of work.",
          "Har kuni birinchi marta ko'radigan so'zlaringiz soni. Ularning har biri yana bir necha marta qaytadi, shuning uchun 20 ta yangi so'z taxminan 60 ta kartochka ishini anglatadi.")}
      </div>

      <div className="section-label">{t("Maximum reviews per day", "Kuniga ko'pi bilan takrorlash")}</div>
      <NumberField
        label={t("Maximum reviews per day", "Kuniga ko'pi bilan takrorlash")}
        value={config.revPerDay}
        min={0}
        max={REV_MAX}
        unit={t("reviews a day", "ta takrorlash kuniga")}
        onCommit={(n) => onChange({ revPerDay: n })}
      />
      <div className="cta-note" style={{ textAlign: "left", marginTop: 8 }}>
        {t("A ceiling for days when a backlog has built up.", "Takrorlanmagan kartochkalar to'planib qolgan kunlar uchun chegara.")}
        {counts.reviewBacklog > 0 && t(` You have ${counts.reviewBacklog.toLocaleString()} waiting.`, ` Sizda ${counts.reviewBacklog.toLocaleString()} tasi kutmoqda.`)}
      </div>

      <div className="section-label">{t("This deck", "Ushbu to'plam")}</div>
      <div className="stat-grid">
        <div className="mini"><b>{counts.seen.toLocaleString()}</b><span>{t("studied", "o'rganilgan")}</span></div>
        <div className="mini"><b>{counts.known.toLocaleString()}</b><span>{t("mature", "o'zlashtirilgan")}</span></div>
        <div className="mini"><b>{counts.total.toLocaleString()}</b><span>{t("in deck", "to'plamda")}</span></div>
      </div>

      <button className="btn btn-danger" onClick={onReset}>{t("Reset this deck", "To'plamni qaytadan boshlash")}</button>
      <div className="cta-note">
        {t("Forgets every card’s schedule in Medical English. Your quiz progress is untouched. Cannot be undone.",
          "Tibbiy ingliz tilidagi barcha kartochkalar jadvali o'chiriladi. Testlardagi natijalaringizga tegilmaydi. Buni qaytarib bo'lmaydi.")}
      </div>

      <Byline />
    </Sheet>
  );
}

/** One card, front then back, with Anki's four answer buttons. */
function Studying({ card, state, shown, counts, onShow, onRate, onQuit }) {
  const ivls = useMemo(() => (shown ? preview(state) : null), [shown, state]);

  return (
    <div className="screen">
      <div className="quiz-top">
        <button className="close" onClick={onQuit} aria-label={t("Back to deck", "To'plamga qaytish")}><Back /></button>
        <div className="lane-counts">
          <span className="lane new">{counts.newCount}</span>
          <span className="lane learn">{counts.learnCount}</span>
          <span className="lane due">{counts.dueCount}</span>
        </div>
      </div>

      <div className="card-face" key={`${card.id}-${shown}`}>
        {!shown ? (
          <button className="card-front" onClick={onShow}>
            {card.yield === "high" && (
              <div className="card-tags"><span className="card-tag hi">{t("high yield", "muhim")}</span></div>
            )}
            <div className="card-term">{card.term}</div>
            {card.ipa && <div className="card-ipa">{card.ipa}</div>}
            <div className="card-hint">{t("Tap to see the meaning", "Ma'nosini ko'rish uchun bosing")}</div>
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
                <span className="rate-n">{gradeName(g)}</span>
              </button>
            ))}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={onShow}>{t("Show meaning", "Ma'nosini ko'rsatish")}</button>
        )}
      </div>
    </div>
  );
}

export default function English({ streak, onStudied, onFocus }) {
  const [status, setStatus] = useState(() => (cards.length ? "ready" : "loading"));
  const [deck, setDeck] = useState(() => rollDay(loadDeckLocal()));
  const [highOnly, setHighOnly] = useState(readHigh);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState(false);

  // The cloud copy decides whether setup has already been answered on another
  // device, so the setup screen must not be shown before it has been read.
  const [remoteChecked, setRemoteChecked] = useState(false);
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
    loadDeckRemote(loadDeckLocal())
      .then((d) => { if (alive) setDeck(rollDay(d)); })
      .finally(() => { if (alive) setRemoteChecked(true); });
    return () => { alive = false; };
  }, []);

  // A flashcard session wants the whole screen; the tab bar steps aside.
  const inSession = studying && Boolean(current);
  useEffect(() => {
    onFocus?.(inSession);
    return () => onFocus?.(false);
  }, [inSession]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const next = answerCard(deck, current.id, grade);
    persist(next);
    onStudied();
    setDone((d) => d + 1);
    advance(next);
  }

  function quitStudy() {
    setStudying(false);
    setCurrent(null);
    flushDeck();
  }

  /* ── loading and failure ─────────────────────────────────────────────── */

  if (status !== "ready" || !remoteChecked) {
    return (
      <div className="screen">
        <ScreenHead title={t("Medical English", "Tibbiy ingliz tili")} />
        <div className="empty" style={{ marginTop: 60 }}>
          {status !== "error" ? (
            <>
              <div className="empty-big">📖</div>
              <div>{t(`Loading ${GLOSSARY_COUNT.toLocaleString()} terms…`, `${GLOSSARY_COUNT.toLocaleString()} ta atama yuklanmoqda…`)}</div>
              <div className="sub" style={{ marginTop: 6 }}>{t("First time only — it is cached after this.", "Faqat birinchi marta — keyin telefonda saqlanadi.")}</div>
            </>
          ) : (
            <>
              <div className="empty-big">😕</div>
              <div>{t("Couldn’t load the glossary.", "Lug'atni yuklab bo'lmadi.")}</div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 20, maxWidth: 240, marginInline: "auto" }}
                onClick={() => { setStatus("loading"); loadGlossary().then(() => setStatus("ready")).catch(() => setStatus("error")); }}
              >
                {t("Retry", "Qayta urinish")}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ── first run ───────────────────────────────────────────────────────── */

  if (!isConfigured(deck)) {
    return (
      <DeckSetup
        onDone={(newPerDay) => {
          haptic("medium");
          persist(setConfig(deck, { newPerDay }));
        }}
      />
    );
  }

  /* ── studying ────────────────────────────────────────────────────────── */

  if (studying && current) {
    return (
      <Studying
        card={current}
        state={stateOf(deck, current.id)}
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
      {/* The same head Home wears, so the two halves read as one app. No
          rating menu here: flashcards earn no XP and are not timed, so
          points, XP and time would only ever describe the quiz. The day
          streak is the one thing both halves share — a day of flashcards
          keeps it alive — so it is the one thing shown. */}
      <ScreenHead
        title={t("Medical English", "Tibbiy ingliz tili")}
        sub={highOnly
          ? t(`High yield only · ${pool.length.toLocaleString()} terms`, `Faqat eng muhimlari · ${pool.length.toLocaleString()} ta atama`)
          : t(`${cards.length.toLocaleString()} clinical terms`, `${cards.length.toLocaleString()} ta klinik atama`)}
        right={
          <div className="stats">
            <StreakPill days={streak} />
            <button className="stat gear" onClick={() => { haptic("light"); setOptions(true); }} aria-label={t("Deck options", "Kartochkalar sozlamalari")}>
              <Gear />
            </button>
          </div>
        }
      />

      <AdCard />

      {done > 0 && (
        <div className="done-note">
          {t(`${done} card${done > 1 ? "s" : ""} answered.`, `${done} ta kartochkaga javob berildi.`)}
          {waiting > 0 ? t(" More are waiting.", " Yana kartochkalar kutmoqda.") : t(" Nothing left due today.", " Bugunga boshqa kartochka qolmadi.")}
        </div>
      )}

      <div className="deck-stats">
        <div className="deck-stat">
          <div className="deck-v new">{counts.newCount.toLocaleString()}</div>
          <div className="deck-l">{t("new", "yangi")}</div>
        </div>
        <div className="deck-stat">
          <div className="deck-v learn">{counts.learnCount.toLocaleString()}</div>
          <div className="deck-l">{t("learning", "o'rganilmoqda")}</div>
        </div>
        <div className="deck-stat">
          <div className="deck-v due">{counts.dueCount.toLocaleString()}</div>
          <div className="deck-l">{t("to review", "takrorlash")}</div>
        </div>
      </div>

      <div className="deck-bar">
        <div className="deck-bar-fill" style={{ width: `${(counts.seen / counts.total) * 100}%` }} />
      </div>
      <div className="deck-bar-note">
        {t(`${counts.seen.toLocaleString()} of ${counts.total.toLocaleString()} studied`,
          `${counts.total.toLocaleString()} tadan ${counts.seen.toLocaleString()} tasi o'rganilgan`)}
        {counts.known > 0 && t(` · ${counts.known.toLocaleString()} mature`, ` · ${counts.known.toLocaleString()} tasi o'zlashtirilgan`)}
      </div>

      <div className="search" style={{ marginTop: 18 }}>
        <span className="search-icon"><SearchIcon /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Look up a word — EN yoki UZ", "So'z qidiring — EN yoki UZ")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
        />
      </div>

      {query.trim() ? (
        hits.length ? (
          <div className="results" style={{ marginTop: 14 }}>
            {hits.slice(0, 12).map((c) => (
              <div key={c.id} className="look-row">
                <div className="look-en">{c.term}</div>
                {c.ipa && <div className="look-ipa">{c.ipa}</div>}
                <div className="look-uz">{c.uz}</div>
                <div className="look-def">{c.def}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty"><div>{t(<>Nothing for “{query.trim()}”.</>, <>«{query.trim()}» bo'yicha hech narsa topilmadi.</>)}</div></div>
        )
      ) : null}

      <div className="pinned">
        <button className="btn btn-primary" onClick={start} disabled={!canStudy}>
          {canStudy
            ? t("Study now", "Hozir o'qish")
            : waiting > 0 ? t("Next card in a few minutes", "Keyingi kartochka bir necha daqiqada") : t("Finished for today", "Bugunga tugadi")}
        </button>
        <div className="cta-note">
          {waiting > 0
            ? t(`${waiting.toLocaleString()} card${waiting > 1 ? "s" : ""} to go today`, `Bugun yana ${waiting.toLocaleString()} ta kartochka`)
            : counts.newRemaining > 0
              ? t(`${counts.newRemaining.toLocaleString()} new words waiting for tomorrow`, `Ertaga ${counts.newRemaining.toLocaleString()} ta yangi so'z kutmoqda`)
              : t("Every card here is scheduled for a later day", "Barcha kartochkalar keyingi kunlarga rejalashtirilgan")}
          {counts.newLimited && waiting > 0 && t(` · ${deck.config.newPerDay} new a day`, ` · kuniga ${deck.config.newPerDay} ta yangi`)}
        </div>
      </div>

      {options && (
        <OptionsSheet
          config={deck.config}
          counts={counts}
          highOnly={highOnly}
          highCount={cards.filter((c) => c.yield === "high").length}
          onHighOnly={(on) => { setHighOnly(on); writeHigh(on); }}
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

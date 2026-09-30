import React, { useEffect, useState } from "react";
import { t } from "../lib/i18n.js";
import { APP_LINK, share } from "../lib/telegram.js";
import { shareMessage } from "../lib/shareText.js";
import bank from "../data/bank.js";
import { Bookmark } from "./Icons.jsx";

const R = 74;
const CIRC = 2 * Math.PI * R;

function Ring({ pct }) {
  // Start at zero so the ring animates on mount rather than snapping.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setShown(pct), 80);
    return () => clearTimeout(timer);
  }, [pct]);

  return (
    <div className="ring-wrap">
      <svg width="168" height="168">
        <circle className="ring-bg" cx="84" cy="84" r={R} fill="none" strokeWidth="13" />
        <circle
          className="ring-fg"
          cx="84" cy="84" r={R} fill="none" strokeWidth="13"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC - (shown / 100) * CIRC}
        />
      </svg>
      <div className="ring-mid">
        <div className="ring-pct">{pct}%</div>
        <div className="ring-sub">{t("accuracy", "to'g'ri")}</div>
      </div>
    </div>
  );
}

function title(pct) {
  if (pct === 100) return t("Perfect round", "Mukammal natija");
  if (pct >= 80) return t("Strong work", "Juda yaxshi");
  if (pct >= 50) return t("Solid effort", "Yaxshi harakat");
  return t("Worth another pass", "Yana bir bor takrorlang");
}

export default function Result({ log, label, points, streak, streakAdvanced, rank, saved = [], onSave, onAgain, onHome, classNote = null }) {
  // A class round earns no XP, keeps no streak and is not shared: it only
  // says what happened to it (handed in, or practice).
  const inClass = classNote !== null;
  const correct = log.filter((l) => l.correct).length;
  const wrong = log.length - correct;
  const pct = log.length ? Math.round((correct / log.length) * 100) : 0;
  const missed = log.filter((l) => !l.correct);

  return (
    <div className="screen result-screen">
      <Ring pct={pct} />

      <div className="result-title">{title(pct)}</div>
      <div className="result-sub">
        {t(`${correct} of ${log.length} correct`, `${log.length} tadan ${correct} tasi to'g'ri`)}{label ? ` · ${label}` : ""}
      </div>

      {streakAdvanced && (
        <div className="streak-pop">
          <div className="n">🔥 {t(`${streak} day${streak > 1 ? "s" : ""}`, `${streak} kun`)}</div>
          <div className="l">{t("Streak extended — come back tomorrow", "Kunlik intizom davom etmoqda — ertaga ham qayting")}</div>
        </div>
      )}

      {/* Correct vs incorrect, as a proportional bar plus explicit numbers. */}
      <div className="split">
        <div className="split-bar">
          <div className="split-ok" style={{ width: `${pct}%` }} />
          <div className="split-no" style={{ width: `${100 - pct}%` }} />
        </div>
        <div className="split-legend">
          <div className="leg">
            <span className="dot ok" />
            <b>{correct}</b> {t("correct", "to'g'ri")}
            <span className="leg-pct">{pct}%</span>
          </div>
          <div className="leg">
            <span className="dot no" />
            <b>{wrong}</b> {t("incorrect", "noto'g'ri")}
            <span className="leg-pct">{100 - pct}%</span>
          </div>
        </div>
      </div>

      {inClass ? (
        <div className="class-ok result-class">{classNote}</div>
      ) : (
        <div className="reward-row">
          <div className="reward mint">
            <div className="reward-v">{points < 0 ? "−" : "+"}{Math.abs(points)}</div>
            <div className="reward-l">{t("Points", "Ball")}</div>
          </div>
          <div className="reward">
            <div className="reward-v">{correct}/{log.length}</div>
            <div className="reward-l">{t("Score", "Natija")}</div>
          </div>
          <div className="reward gold">
            <div className="reward-v">{streak}</div>
            <div className="reward-l">{t("Streak", "Intizom")}</div>
          </div>
        </div>
      )}

      {missed.length > 0 && (
        <div className="review">
          <div className="section-label">{t("What you missed", "Xato qilganlaringiz")}</div>
          {missed.slice(0, 5).map((l, i) => {
            const on = saved.includes(l.question.id);
            const right = l.question.type === "gap" ? l.question.answer : l.question.options[l.question.answer];
            return (
              <div className="review-item" key={i}>
                <span className="review-mark no">✗</span>
                <span className="review-q">
                  {l.question.topic !== right && <>{l.question.topic} — </>}<b>{right}</b>
                </span>
                {onSave && (
                  <button
                    className={`save-btn small${on ? " on" : ""}`}
                    onClick={() => onSave(l.question.id)}
                    aria-pressed={on}
                    aria-label={on ? t("Remove from saved", "Saqlanganlardan olib tashlash") : t("Save this question", "Savolni saqlash")}
                  >
                    <Bookmark size={18} filled={on} />
                  </button>
                )}
              </div>
            );
          })}
          {!inClass && <div className="review-note">
            {t(
              <>{missed.length === 1 ? "It waits" : "They wait"} in <b>Mistakes</b> on the Quiz tab until you get {missed.length === 1 ? "it" : "them"} right.</>,
              <>To'g'ri javob bermaguningizcha ular «Testlar» bo'limidagi <b>Xatolar</b>da turadi.</>,
            )}
          </div>}
        </div>
      )}

      <div className="result-actions">
        <button className="btn btn-primary" onClick={onAgain}>
          {inClass ? t("Practise again", "Yana mashq qilish") : t("Another round", "Yana bir marta")}
        </button>
        {!inClass && <button
          className="btn btn-ghost"
          onClick={() =>
            share(shareMessage({
              correct,
              total: log.length,
              label,
              streak,
              rank,
              bankSize: bank.length,
              link: APP_LINK,
            }))
          }
        >
          {t("Share score", "Natijani ulashish")}
        </button>}
        <button className="btn btn-ghost" onClick={onHome}>{t("Done for now", "Hozircha yetarli")}</button>
      </div>
    </div>
  );
}

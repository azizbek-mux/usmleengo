import React, { useMemo } from "react";
import { POINTS_MAX, XP, formatPace, points } from "../lib/rating.js";
import { haptic } from "../lib/telegram.js";
import { ratingData, useLiveBoard } from "./Rating.jsx";

/** "#6 of 14" when there is anyone to be placed against. */
const placeOf = (standing) => (standing?.me && standing.total > 1 ? `#${standing.me.place} of ${standing.total}` : null);

/**
 * My performance: the three numbers the rating is built from, the points they
 * make, and where each one places the viewer. Everything personal that used
 * to crowd the home screen's header lives here now.
 */
export default function Performance({ state, board, onRefresh, onRating, onBack }) {
  useLiveBoard(onRefresh);

  const { me, boards, input } = useMemo(() => ratingData(state, board), [state, board]);
  const r = me.rating;
  const t = input.timing;
  const accuracy = state.answered ? Math.round((state.correct / state.answered) * 100) : 0;

  const cards = [
    {
      id: "streak",
      label: "Day streak",
      value: `${r.raw.streak}`,
      unit: r.raw.streak === 1 ? "day" : "days",
      detail: `Best ever: ${Math.max(state.best || 0, r.raw.streak)} ${Math.max(state.best || 0, r.raw.streak) === 1 ? "day" : "days"}`,
    },
    {
      id: "xp",
      label: "XP",
      value: r.raw.xp.toLocaleString(),
      unit: "",
      detail: `${state.answered.toLocaleString()} answered · ${accuracy}% correct`,
    },
    {
      id: "speed",
      label: "Average time",
      value: formatPace(r.raw.pace),
      unit: "",
      detail: r.raw.pace
        ? [t.binaryN ? `Tapped ${formatPace(t.binaryMs)}` : null, t.gapN ? `typed ${formatPace(t.gapMs)}` : null]
          .filter(Boolean).join(" · ")
        : "Timed on correct answers only",
    },
  ];

  return (
    <div className="screen rating">
      <div className="rating-top">
        <button className="back-link" onClick={() => { haptic("light"); onBack(); }}>‹ Back</button>
        <span className="rating-title">My performance</span>
        <span className="rating-spacer" />
      </div>

      <button className="perf-points" onClick={() => { haptic("light"); onRating(); }}>
        <span className="perf-points-l">Your points</span>
        <span className="perf-points-v">
          {points(r.overall)}<small>/{POINTS_MAX}</small>
        </span>
        <span className="perf-points-place">
          {placeOf(boards.overall) ? `${placeOf(boards.overall)} on the rating ›` : "See the rating ›"}
        </span>
      </button>

      <div className="perf-list">
        {cards.map((c) => (
          <div key={c.id} className="perf-card">
            <div className="perf-main">
              <span className="perf-label">{c.label}</span>
              <span className="perf-value">
                {c.value}{c.unit && <small> {c.unit}</small>}
              </span>
              <span className="perf-detail">{c.detail}</span>
            </div>
            {placeOf(boards[c.id]) && <span className="perf-place">{placeOf(boards[c.id])}</span>}
          </div>
        ))}
      </div>

      <div className="section-label">What an answer earns</div>
      <div className="xp-rules">
        <div className="xp-rule">
          <span className="xp-amt ok">+{XP.gapCorrect}</span>
          <span>for a correct answer you <b>typed</b></span>
        </div>
        <div className="xp-rule">
          <span className="xp-amt ok">+{XP.binaryCorrect}</span>
          <span>for a correct answer you <b>tapped</b></span>
        </div>
        <div className="xp-rule">
          <span className="xp-amt">+{XP.wrong}</span>
          <span>for a wrong answer — reading why is how it sticks</span>
        </div>
      </div>
    </div>
  );
}

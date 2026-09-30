import React from "react";

// Line icons, one place for all of them. Same grid, stroke and caps
// throughout, and currentColor, so each takes the colour of wherever it sits
// in either theme.

const Line = ({ size = 20, width = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

/* ── the tab bar ── */

/** A ticked list: the quizzes. */
export const Checklist = ({ size = 22 }) => (
  <Line size={size} width={2.2}>
    <path d="M9 5h10M9 12h10M9 19h10" />
    <path d="m3 5 1.5 1.5L7 4" />
    <path d="m3 12 1.5 1.5L7 11" />
    <circle cx="4.5" cy="19" r="1.4" />
  </Line>
);

/** A book: Medical English. */
export const Book = ({ size = 22 }) => (
  <Line size={size} width={2.2}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Line>
);

/** Two people: playing together. */
export const Players = ({ size = 22 }) => (
  <Line size={size} width={2.2}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M16 14.2c2.8.3 5 2.6 5 5.8" />
  </Line>
);

export const Trophy = ({ size = 20 }) => (
  <Line size={size}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </Line>
);

/** One person: you. */
export const User = ({ size = 22 }) => (
  <Line size={size} width={2.2}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
  </Line>
);

/* ── review ── */

/** A bookmark; filled once the question is saved. */
export const Bookmark = ({ size = 20, filled = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 3h12v18l-6-4.5L6 21V3z" />
  </svg>
);

/** Round the circle again: the mistakes, until they are right. */
export const Retry = ({ size = 20 }) => (
  <Line size={size} width={2.2}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </Line>
);

/** A target: where to aim. */
export const Target = ({ size = 20 }) => (
  <Line size={size} width={2.2}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" />
  </Line>
);

/** A school building: the classroom. */
export const School = ({ size = 22 }) => (
  <Line size={size} width={2.2}>
    <path d="M3 21h18M5 21V10l7-5 7 5v11" />
    <path d="M10 21v-5h4v5" />
    <circle cx="12" cy="11" r="1.6" />
  </Line>
);

/* ── elsewhere ── */

export const Gear = ({ size = 19 }) => (
  <Line size={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Line>
);

/** A small chevron pointing onward, for rows that open something. */
export const Chevron = ({ size = 16 }) => (
  <Line size={size}><path d="M9 6l6 6-6 6" /></Line>
);

/** A small chevron pointing down, for buttons that open a picker. */
export const ChevronDown = ({ size = 14 }) => (
  <Line size={size} width={2.4}><path d="M6 9l6 6 6-6" /></Line>
);

export const SearchIcon = ({ size = 18 }) => (
  <Line size={size} width={2.5}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Line>
);

/** The tick in a ticked box. Heavier than the rest: it is tiny on screen. */
export const Tick = ({ size = 14 }) => (
  <Line size={size} width={3}><path d="M4 12.5l5.5 5.5L20 6" /></Line>
);

/** A laboratory flask: the NBME lab values. */
export const Flask = ({ size = 20 }) => (
  <Line size={size}>
    <path d="M9 3h6" />
    <path d="M10 3v6.2L4.6 18.4A2 2 0 0 0 6.3 21.4h11.4a2 2 0 0 0 1.7-3L14 9.2V3" />
    <path d="M7.6 15h8.8" />
  </Line>
);

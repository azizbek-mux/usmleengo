import React, { useMemo, useState } from "react";
import { LABS } from "../data/labs.js";
import { haptic } from "../lib/telegram.js";
import { t, isUz } from "../lib/i18n.js";
import { SearchIcon } from "./Icons.jsx";
import { Sheet } from "./Sheet.jsx";

/**
 * The NBME laboratory reference values, in a sheet: opened from the flask
 * beside the search on the Quiz tab, and from the top of a question, so the
 * numbers are there while the question is. A search narrows it by test or by
 * section, and the NBME's two columns - conventional units and SI - are a
 * switch at the top.
 */
export default function LabValues({ onClose }) {
  const [query, setQuery] = useState("");
  const [si, setSi] = useState(false);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const sections = useMemo(() => {
    if (!words.length) return LABS;
    return LABS
      .map((sec) => {
        const title = `${sec.en} ${sec.uz}`.toLowerCase();
        // A section named in the search shows whole; otherwise only its matching rows.
        if (words.every((w) => title.includes(w))) return sec;
        return { ...sec, rows: sec.rows.filter(([name]) => words.every((w) => name.toLowerCase().includes(w))) };
      })
      .filter((sec) => sec.rows.length);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet title={t("NBME lab values", "NBME laboratoriya me'yorlari")} onClose={onClose}>
      <div className="search lab-search">
        <span className="search-icon"><SearchIcon /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Find a test — sodium, TSH, ferritin…", "Tahlilni toping — sodium, TSH, ferritin…")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="search"
        />
      </div>

      <div className="period lab-units" role="tablist" aria-label={t("Units", "Birliklar")}>
        {[[false, t("Conventional units", "Odatiy birliklar")], [true, t("SI units", "SI birliklari")]].map(([on, label]) => (
          <button
            key={label}
            role="tab"
            aria-selected={si === on}
            className={`period-opt${si === on ? " on" : ""}`}
            onClick={() => { if (si !== on) { haptic("light"); setSi(on); } }}
          >
            {label}
          </button>
        ))}
      </div>

      {sections.length ? sections.map((sec) => (
        <div key={sec.id} className="lab-section">
          <div className="section-label lab-title">{isUz() ? sec.uz : sec.en}</div>
          <div className="lab-list">
            {sec.rows.map((row) => {
              const [name] = row;
              const range = si ? row[3] : row[1];
              const unit = si ? row[4] : row[2];
              return (
                <div key={name} className={`lab-row${name.length > 28 ? " stack" : ""}`}>
                  <span className="lab-name">{name}</span>
                  <span className="lab-val">{range}{unit && <small>{unit}</small>}</span>
                </div>
              );
            })}
          </div>
        </div>
      )) : (
        <div className="class-note">{t(`No test called “${query.trim()}”.`, `«${query.trim()}» nomli tahlil topilmadi.`)}</div>
      )}

      <div className="cta-note lab-note">
        {t("The NBME’s laboratory reference values, as printed for its exams. Laboratories differ a little: on the ward, use your own lab’s ranges.",
          "NBME imtihonlari uchun bosilgan laboratoriya me'yorlari. Laboratoriyalar orasida ozgina farq bo'ladi: amaliyotda o'z laboratoriyangiz me'yorlaridan foydalaning.")}
      </div>
    </Sheet>
  );
}

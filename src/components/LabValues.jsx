import React, { useMemo, useState } from "react";
import { LABS } from "../data/labs.js";
import { t, isUz } from "../lib/i18n.js";
import { SearchIcon } from "./Icons.jsx";
import { Sheet } from "./Sheet.jsx";

/**
 * Normal laboratory values, in a sheet: opened from the flask beside the
 * search on the Quiz tab, and from the top of a question, so the numbers are
 * there while the question is. A search narrows it by analyte or by section.
 */
export default function LabValues({ onClose }) {
  const [query, setQuery] = useState("");
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
    <Sheet title={t("Normal lab values", "Normal laboratoriya ko'rsatkichlari")} onClose={onClose}>
      <div className="search lab-search">
        <span className="search-icon"><SearchIcon /></span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Find a test — sodium, TSH, INR…", "Tahlilni toping — sodium, TSH, ferritin…")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="search"
        />
      </div>

      {sections.length ? sections.map((sec) => (
        <div key={sec.id} className="lab-section">
          <div className="section-label lab-title">{isUz() ? sec.uz : sec.en}</div>
          <div className="lab-list">
            {sec.rows.map(([name, range, unit]) => (
              <div key={name} className="lab-row">
                <span className="lab-name">{name}</span>
                <span className="lab-val">{range}<small>{unit}</small></span>
              </div>
            ))}
          </div>
        </div>
      )) : (
        <div className="class-note">{t(`No test called “${query.trim()}”.`, `«${query.trim()}» nomli tahlil topilmadi.`)}</div>
      )}

      <div className="cta-note lab-note">
        {t("Adult reference ranges as the USMLE prints them, in conventional units. Laboratories differ a little: on the ward, use your own lab’s ranges.",
          "Kattalar uchun USMLE bosib chiqaradigan me'yoriy qiymatlar, odatiy birliklarda. Laboratoriyalar orasida ozgina farq bo'ladi: amaliyotda o'z laboratoriyangiz me'yorlaridan foydalaning.")}
      </div>
    </Sheet>
  );
}

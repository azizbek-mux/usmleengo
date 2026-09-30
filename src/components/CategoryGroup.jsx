import React, { useMemo, useState } from "react";
import bank from "../data/bank.js";
import { ChevronDown, Tick } from "./Icons.jsx";
import { SUBJECTS, SYSTEMS, subjectName, systemName } from "../lib/taxonomy.js";
import { t } from "../lib/i18n.js";
import { haptic } from "../lib/telegram.js";

/**
 * One axis of the bank, as a list to tick down.
 *
 * Twenty-six systems and thirteen subjects is more than a row of chips can
 * hold, and a chip cannot say how many questions are behind it. A list can
 * do both, and folds away once it has been used — the header keeps saying
 * what is chosen while it is shut, so nothing is hidden by closing it.
 */
export default function CategoryGroup({ label, rows, chosen, onToggle, onAll, onNone }) {
  const [open, setOpen] = useState(true);
  const n = rows.filter((r) => chosen.has(r.id)).length;

  return (
    <div className="cat-group">
      <div className="cat-head">
        <button
          className="cat-title"
          aria-expanded={open}
          onClick={() => { haptic("light"); setOpen(!open); }}
        >
          <span className="section-label" style={{ margin: 0 }}>{label}</span>
          <span className="cat-count">
            {n ? t(`${n} chosen`, `${n} ta tanlandi`) : t("All", "Hammasi")}
          </span>
          <span className={`cat-chevron${open ? " open" : ""}`}><ChevronDown /></span>
        </button>
        {open && (
          <div className="cat-acts">
            <button className="chips-clear" onClick={onAll}>{t("Select all", "Hammasini tanlash")}</button>
            {n > 0 && <button className="chips-clear" onClick={onNone}>{t("Clear", "Tozalash")}</button>}
          </div>
        )}
      </div>

      {open && (
        <div className="cat-list">
          {rows.map((r) => (
            <button
              key={r.id}
              className={`cat-row${chosen.has(r.id) ? " on" : ""}`}
              role="checkbox"
              aria-checked={chosen.has(r.id)}
              onClick={() => onToggle(r.id)}
            >
              <span className="cat-box" aria-hidden="true">{chosen.has(r.id) ? <Tick /> : null}</span>
              <span className="cat-name">{r.name}</span>
              <span className="cat-n">{r.n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Both axes with their counts, named in the language showing and sorted in
 * it. Counted from the bank rather than written down, so the numbers cannot
 * go stale, and an axis that holds nothing is not offered at all.
 *
 * `lang` is only there to recount when the language changes — the names and
 * their order are different in Uzbek.
 */
export function useCategories(lang) {
  return useMemo(() => {
    const tally = (key) => bank.reduce((m, q) => m.set(q[key], (m.get(q[key]) || 0) + 1), new Map());
    const build = (list, counts, name) => list
      .map((x) => ({ id: x.id, name: name(x.id), n: counts.get(x.id) || 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    return {
      systems: build(SYSTEMS, tally("system"), systemName),
      subjects: build(SUBJECTS, tally("subject"), subjectName),
    };
  }, [lang]);
}

/**
 * The questions left once both axes have been narrowed. Empty lists mean
 * the whole bank on that axis; the two are combined with "and", so
 * Cardiovascular plus Pharmacology is heart drugs and nothing else.
 */
export function narrow(list, systems, subjects) {
  const sys = new Set(systems);
  const sub = new Set(subjects);
  if (!sys.size && !sub.size) return list;
  return list.filter((q) => (!sys.size || sys.has(q.system)) && (!sub.size || sub.has(q.subject)));
}

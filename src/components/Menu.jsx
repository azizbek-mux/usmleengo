import React, { useEffect, useState } from "react";
import { haptic } from "../lib/telegram.js";
import { Burger, Chart, Chevron, Gear, Trophy } from "./Icons.jsx";

/**
 * The three-line menu in the top corner.
 *
 * Everything about the user that is not studying — where they rank, how they
 * are doing, and the settings — lives behind this one button, so both home
 * screens stay about the studying itself and there is room to add features
 * later without the header filling up again.
 *
 * `onSettings` is whatever settings mean on the screen it sits on: the quiz
 * settings on Home, the deck options in Medical English.
 */
export default function MainMenu({ onRating, onPerformance, onSettings }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const pick = (action) => () => {
    haptic("light");
    setOpen(false);
    action?.();
  };

  const items = [
    { label: "Rating", icon: <Trophy />, action: onRating },
    { label: "My performance", icon: <Chart />, action: onPerformance },
    { label: "Settings", icon: <Gear size={20} />, action: onSettings },
  ];

  return (
    <div className="menu-wrap">
      <button
        className="stat gear"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { haptic("light"); setOpen((o) => !o); }}
      >
        <Burger />
      </button>
      {open && (
        <>
          {/* Invisible, full screen: a tap anywhere outside closes the menu. */}
          <div className="menu-back" onClick={() => setOpen(false)} />
          <div className="menu" role="menu">
            {items.map((item) => (
              <button key={item.label} role="menuitem" className="menu-item" onClick={pick(item.action)}>
                <span className="menu-ico">{item.icon}</span>
                <span className="menu-label">{item.label}</span>
                <span className="menu-go"><Chevron /></span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

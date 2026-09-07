import React, { useEffect, useState } from "react";
import { dismiss, isDismissed, loadAnnouncement } from "../data/announcement.js";
import { haptic, openTelegram } from "../lib/telegram.js";

/**
 * The announcement card: whatever was last posted on the channel with the
 * tag, shown on both home screens until it is dismissed or expires.
 *
 * Renders nothing at all until there is something to show, so the layout does
 * not jump on load and no space is reserved for a card that may not exist.
 */
export default function AdCard() {
  const [ad, setAd] = useState(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let alive = true;
    loadAnnouncement().then((a) => {
      if (alive && a && !isDismissed(a.id)) setAd(a);
    });
    return () => { alive = false; };
  }, []);

  if (!ad || gone) return null;

  const open = () => {
    haptic("light");
    openTelegram(ad.link);
  };

  const close = (e) => {
    e.stopPropagation();
    haptic("light");
    dismiss(ad.id);
    setGone(true);
  };

  return (
    <div className="ad">
      <button className="ad-main" onClick={open}>
        {ad.image && (
          <span className="ad-thumb">
            {/* Hosted by Telegram's CDN. If it fails to load the card simply
                loses its picture — the text is the message. */}
            <img src={ad.image} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </span>
        )}
        <span className="ad-body">
          <span className="ad-from">From the channel</span>
          <span className="ad-title">{ad.title}</span>
          {ad.body && <span className="ad-text">{ad.body}</span>}
        </span>
      </button>
      <button className="ad-x" onClick={close} aria-label="Dismiss">×</button>
    </div>
  );
}

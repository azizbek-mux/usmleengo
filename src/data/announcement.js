// The announcement card's content, built from a tagged post on the channel.
//
// Written by tools/fetch-announcement.mjs during the deploy; see that file for
// how a post becomes a card. The file is "null" when there is nothing to show,
// and may be missing entirely on an old build — both mean the same thing.

const KEY = "usmleengo_ad_seen";

// Matches MAX_AGE_DAYS in the fetcher. Checked again here because a deploy can
// sit unchanged for a long time — scheduled workflows are disabled after a
// couple of months of repository quiet — and a stale card should still expire.
const MAX_AGE_DAYS = 14;

let pending = null;

export function loadAnnouncement() {
  if (pending) return pending;

  // Cache-bust by the hour rather than a content hash: the file is a few
  // hundred bytes, and a hash would have to live in the JS bundle, so every
  // announcement would force everyone to re-download the whole app.
  const bucket = Math.floor(Date.now() / 3600000);
  const url = `${import.meta.env.BASE_URL}announcement.json?h=${bucket}`;

  pending = fetch(url)
    .then((res) => (res.ok ? res.json() : null))
    .then((ad) => (valid(ad) ? ad : null))
    .catch(() => null); // a missing file is simply no announcement

  return pending;
}

function valid(ad) {
  if (!ad || typeof ad !== "object" || !ad.id || !ad.title || !ad.link) return false;
  // Only ever link into Telegram — the card's content comes from a page this
  // app does not control, so the destination is worth checking.
  if (!/^https:\/\/t\.me\//.test(ad.link)) return false;
  if (ad.date) {
    const age = (Date.now() - Date.parse(ad.date)) / 86400000;
    if (Number.isFinite(age) && age > MAX_AGE_DAYS) return false;
  }
  return true;
}

/* ── dismissal ─────────────────────────────────────────────────────────────
   Per post, in localStorage only. It is a preference about one card on one
   device, not progress worth a cloud round trip. */

export function isDismissed(id) {
  try {
    return localStorage.getItem(KEY) === id;
  } catch {
    return false;
  }
}

export function dismiss(id) {
  try {
    // One id, not a list: a new announcement should always show, and there is
    // no reason to remember cards that can no longer appear.
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode — the card comes back next launch, which is survivable */
  }
}

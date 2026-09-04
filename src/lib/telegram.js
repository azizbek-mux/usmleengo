// Thin wrapper over the Telegram WebApp SDK.
// Everything here degrades to a no-op in a plain browser so the app can be
// developed and tested outside Telegram.

const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;

export const inTelegram = Boolean(tg?.initData !== undefined && tg?.platform !== "unknown");

/** Bot API version gate — CloudStorage needs 6.9+, some UI needs 6.1+. */
function supports(version) {
  if (!tg?.version) return false;
  const [a, b] = tg.version.split(".").map(Number);
  const [x, y] = version.split(".").map(Number);
  return a > x || (a === x && b >= y);
}

export function init() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  // Stops a downward swipe from dismissing the app mid-quiz (Bot API 7.7+).
  tg.disableVerticalSwipes?.();
  tg.setHeaderColor?.("#0f1115");
  tg.setBackgroundColor?.("#0f1115");
}

export function userName() {
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;
  return u.first_name || u.username || null;
}

/** Haptics: 'light' | 'medium' | 'heavy' for taps, or a notification type. */
export function haptic(kind) {
  if (!supports("6.1")) return;
  const h = tg?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === "success" || kind === "error" || kind === "warning") {
      h.notificationOccurred(kind);
    } else {
      h.impactOccurred(kind || "light");
    }
  } catch {
    /* haptics are cosmetic — never let them break the quiz */
  }
}

export const cloudAvailable = supports("6.9") && Boolean(tg?.CloudStorage);

export function cloudGet(keys) {
  return new Promise((resolve) => {
    if (!cloudAvailable) return resolve(null);
    try {
      tg.CloudStorage.getItems(keys, (err, res) => resolve(err ? null : res));
    } catch {
      resolve(null);
    }
  });
}

export function cloudSet(key, value) {
  return new Promise((resolve) => {
    if (!cloudAvailable) return resolve(false);
    try {
      tg.CloudStorage.setItem(key, value, (err) => resolve(!err));
    } catch {
      resolve(false);
    }
  });
}

export function cloudRemove(keys) {
  return new Promise((resolve) => {
    if (!cloudAvailable || !keys.length) return resolve(false);
    try {
      tg.CloudStorage.removeItems(keys, (err) => resolve(!err));
    } catch {
      resolve(false);
    }
  });
}

/* ── chunked values ────────────────────────────────────────────────────────
   CloudStorage caps a single value at 4096 characters. Anything that can
   outgrow that is split across numbered keys with a header key holding the
   chunk count and the total length; a value whose parts do not add back up to
   that length is rejected rather than half-restored. Without this, an
   oversized write just fails and cross-device progress stops syncing with no
   error anywhere. */

const CHUNK = 3800;
// 200 chunks is ~740 KB, comfortably more than either the deck or the quiz can
// produce, and well under CloudStorage's 1024-key budget shared between them.
// Past it we decline the cloud write rather than truncate: localStorage still
// holds the whole thing.
const MAX_CHUNKS = 200;

const chunkKey = (prefix, i) => `${prefix}__${i}`;
const headKey = (prefix) => `${prefix}__n`;

// What we last wrote, per prefix, so a save only sends the chunks that
// actually changed. A flashcard answer edits a dozen characters in the middle
// of a long string; rewriting all fifty chunks for that would be fifty round
// trips per card.
const written = new Map();

export async function cloudSetChunked(prefix, value) {
  if (!cloudAvailable) return false;

  const chunks = [];
  for (let i = 0; i < value.length; i += CHUNK) chunks.push(value.slice(i, i + CHUNK));
  if (chunks.length > MAX_CHUNKS) return false;

  const head = await cloudGet([headKey(prefix)]);
  const headValue = String(head?.[headKey(prefix)] || "");
  const before = Number(headValue.split(".")[0]) || 0;

  // Only trust the cache if the store still holds the header we left behind;
  // another device may have written since.
  const cached = written.get(prefix);
  const prev = cached && cached.head === headValue ? cached.chunks : null;

  for (let i = 0; i < chunks.length; i++) {
    if (prev && prev[i] === chunks[i]) continue;
    if (!(await cloudSet(chunkKey(prefix, i), chunks[i]))) { written.delete(prefix); return false; }
  }
  // Written last, so an interrupted write leaves the previous header pointing
  // at a length the new chunks will not match — and the read rejects it.
  const nextHead = `${chunks.length}.${value.length}`;
  if (!(await cloudSet(headKey(prefix), nextHead))) { written.delete(prefix); return false; }

  if (before > chunks.length) {
    const stale = [];
    for (let i = chunks.length; i < before; i++) stale.push(chunkKey(prefix, i));
    await cloudRemove(stale);
  }
  written.set(prefix, { head: nextHead, chunks });
  return true;
}

export async function cloudGetChunked(prefix) {
  if (!cloudAvailable) return null;

  const head = await cloudGet([headKey(prefix)]);
  const [countRaw, lengthRaw] = String(head?.[headKey(prefix)] || "").split(".");
  const count = Number(countRaw) || 0;
  const length = Number(lengthRaw) || 0;
  if (!count) return null;

  const keys = Array.from({ length: count }, (_, i) => chunkKey(prefix, i));
  const res = await cloudGet(keys);
  if (!res) return null;

  let out = "";
  for (const k of keys) {
    if (typeof res[k] !== "string") return null; // a chunk went missing
    out += res[k];
  }
  return out.length === length ? out : null;
}

/**
 * The Mini App's public link, exactly as BotFather issued it.
 *
 * This is the only place it is written down. A shared score is worthless
 * without it — whoever receives the message needs somewhere to tap.
 * If the bot is ever renamed, change this line and nothing else.
 */
export const APP_LINK = "https://t.me/usmleengo_bot/study";

/** Share the user's streak back into a Telegram chat, with a way in. */
export function share(text) {
  const url =
    `https://t.me/share/url?url=${encodeURIComponent(APP_LINK)}` +
    `&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank");
}

export default tg;

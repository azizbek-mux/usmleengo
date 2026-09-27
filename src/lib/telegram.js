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
  // The header and background colours are not set here: they depend on which
  // palette is painted, so theme.js sets them through setChrome() once it has
  // resolved the user's preference.
}

/**
 * Telegram's own light/dark setting, or null outside Telegram.
 *
 * This is what the user sees around the Mini App, and it does not always
 * match the operating system — someone can run Telegram dark on a light
 * phone — so it wins over the media query when we have it.
 */
export function colorScheme() {
  // Gated on inTelegram, not just on the SDK being present. The script is
  // loaded from index.html on the web too, and outside Telegram it answers
  // "light" no matter what the machine is set to — trusting that would hand
  // every browser visitor a light app and ignore their system setting.
  if (!inTelegram) return null;
  const scheme = tg?.colorScheme;
  return scheme === "light" || scheme === "dark" ? scheme : null;
}

/** Paint Telegram's header and background to match the app's own. */
export function setChrome(color) {
  if (!tg) return;
  try {
    tg.setHeaderColor?.(color);
    tg.setBackgroundColor?.(color);
  } catch {
    /* older clients reject a hex colour here; the app still renders */
  }
}

/** Fires when the user changes their Telegram theme. Returns an unsubscribe. */
export function onThemeChange(handler) {
  if (!tg?.onEvent) return () => {};
  tg.onEvent("themeChanged", handler);
  return () => tg.offEvent?.("themeChanged", handler);
}

export function userName() {
  const u = tg?.initDataUnsafe?.user;
  if (!u) return null;
  return u.first_name || u.username || null;
}

/**
 * Telegram's signed launch data, or null outside Telegram. Sent with every
 * score so the rating server can check who it came from; see
 * worker/src/telegram.js. It is never stored or shown.
 */
export function initData() {
  if (!inTelegram) return null;
  return typeof tg?.initData === "string" && tg.initData ? tg.initData : null;
}

/**
 * The viewer's own Telegram profile — name and username — or null outside
 * Telegram. Only used to label their own row on the rating board with the
 * same name everyone else sees there.
 */
export function telegramUser() {
  if (!inTelegram) return null;
  const u = tg?.initDataUnsafe?.user;
  return u ? { first_name: u.first_name, last_name: u.last_name, username: u.username } : null;
}

/**
 * What a direct link carried: …/study?startapp=<this>. Telegram hands it over
 * as start_param; on the web the same ?startapp= in the address works, so an
 * invite can be tried in a browser.
 */
export function startParam() {
  const fromTelegram = tg?.initDataUnsafe?.start_param;
  if (fromTelegram) return String(fromTelegram);
  try {
    return new URLSearchParams(window.location.search).get("startapp");
  } catch {
    return null;
  }
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


/** The author's channel, linked from the byline. */
export const CHANNEL = "https://t.me/mukhtorov_md";

/**
 * Open a t.me link.
 *
 * Inside Telegram this must go through openTelegramLink: letting the webview
 * navigate to t.me would replace the Mini App with a web page, and the user
 * would have to reopen it from the bot to get back.
 */
export function openTelegram(url) {
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Share a message into a Telegram chat.
 *
 * Telegram builds the shared message as the `url` parameter, a new line,
 * then `text` — so a link passed as `url` always lands on top. The whole
 * message goes in `url` instead, link included, which keeps it in the order
 * it was written: the link last, under the "You can try now 👇" that points
 * at it. See shareText.js for the message itself.
 */
export function share(message) {
  openTelegram(`https://t.me/share/url?url=${encodeURIComponent(message)}`);
}

export default tg;

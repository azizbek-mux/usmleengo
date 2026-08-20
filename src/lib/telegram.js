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

// Checking that a request really comes from a Telegram user.
//
// When Telegram opens a Mini App it hands the page `initData`: who the user
// is, when the app was opened, and a hash that only someone holding the bot's
// token can produce. The app passes it along with every score, and this
// checks the hash — so a score can only ever be filed under the person who
// actually opened the app. The method is Telegram's own:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
//   secret = HMAC-SHA-256(key "WebAppData", message bot token)
//   hash   = hex(HMAC-SHA-256(key secret, message data-check-string))
//
// where the data-check-string is every field except `hash`, as key=value,
// sorted by key and joined with newlines.
//
// Web Crypto only, so the same file runs on Cloudflare and in the Node tests.

const enc = new TextEncoder();

async function hmac(key, message) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, typeof message === "string" ? enc.encode(message) : message));
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Compare without stopping at the first difference, so timing reveals nothing. */
function sameText(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A week. Telegram issues fresh initData every time the app is opened, so a
 * real one is minutes or hours old; the allowance is for an app left open
 * overnight. Anything older is refused, which limits how long a leaked copy
 * could be misused.
 */
export const MAX_AGE_SECONDS = 7 * 86400;

/**
 * The Telegram user behind `initData`, or null if it was not signed with this
 * bot's token, is too old, or names no user.
 */
export async function verifyInitData(initData, botToken, now = Date.now()) {
  if (typeof initData !== "string" || !initData || initData.length > 4096 || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = await hmac(enc.encode("WebAppData"), botToken);
  if (!sameText(hex(await hmac(secret, check)), hash.toLowerCase())) return null;

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return null;
  const age = now / 1000 - authDate;
  if (age > MAX_AGE_SECONDS || age < -300) return null;

  let user;
  try { user = JSON.parse(params.get("user") || "null"); } catch { return null; }
  if (!user || !Number.isSafeInteger(user.id)) return null;
  return { user, authDate };
}

/**
 * Build signed initData the way Telegram does. Only ever used by the tests,
 * with a made-up token — it is here so the tests exercise exactly the
 * algorithm above rather than a copy of it.
 */
export async function signInitData(fields, botToken) {
  const params = new URLSearchParams(fields);
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await hmac(enc.encode("WebAppData"), botToken);
  params.set("hash", hex(await hmac(secret, check)));
  return params.toString();
}

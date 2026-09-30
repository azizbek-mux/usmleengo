// Per-account local storage.
//
// Telegram lets one app hold several accounts, and every one of them opens
// the Mini App in the same webview, so they all see the same localStorage.
// Progress kept under a bare key therefore crossed over: the second account
// found the first one's XP, "most progress wins" preferred it to its own
// empty cloud copy, and the rating server ranked it under both names.
//
// Every local key is labelled with the Telegram user id instead. Outside
// Telegram there is no id and the bare key is used, as it always was.
// CloudStorage is per account already and needs nothing.

import { cloudAvailable, userId } from "./telegram.js";

/** The localStorage key for this account. */
export function scoped(key) {
  const id = userId();
  return id ? `${key}:${id}` : key;
}

/**
 * What this account has stored under `key`, or null if nothing.
 *
 * Progress written before the keys carried an id sits under the bare key and
 * cannot be told apart by account, so it is never handed to a phone that can
 * ask the cloud - the cloud copy is the account's own. Only where there is no
 * cloud (an old Telegram) is it the one copy there is, and it stands in until
 * the account saves its own.
 */
export function readOwn(key) {
  const own = localStorage.getItem(scoped(key));
  if (own !== null) return own;
  return userId() && !cloudAvailable ? localStorage.getItem(key) : null;
}

/**
 * True when this account has nothing stored on the phone yet, so what is on
 * screen is a blank one and the cloud has not been asked. Anything saved in
 * that window must stay off the cloud: a blank state written over the real
 * copy would erase it.
 */
export function unlabelledStart(key) {
  try {
    return userId() !== null && cloudAvailable && localStorage.getItem(scoped(key)) === null;
  } catch {
    return false;
  }
}

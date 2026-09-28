// Talking to the classrooms on the server (worker/src/classroom.js).
//
// Every call carries Telegram's signed launch data — a class is people who
// know each other by name, so it only works inside Telegram — and the
// caller's score, so what a teacher sees is as fresh as the student's last
// visit. Accuracy and weak topics ride along only for someone who has asked
// to join a class (see classDetail in ratingApi.js).

import { RATING_API, classDetail, classSharing } from "./ratingApi.js";
import { ratingInput } from "./storage.js";
import { initData } from "./telegram.js";

export class ClassError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** One classroom call. Resolves to the server's reply, or throws a ClassError. */
export async function classCall(action, payload = {}, state = null) {
  const signed = initData();
  if (!signed) throw new ClassError("telegram");
  const withDetail = state && (action === "join" || classSharing());
  let res;
  try {
    res = await fetch(`${RATING_API}/class/${action}`, {
      method: "POST",
      // text/plain, as everywhere else: no CORS preflight.
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({
        initData: signed,
        ...(state ? { score: ratingInput(state) } : {}),
        ...(withDetail ? { detail: classDetail(state) } : {}),
        ...payload,
      }),
    });
  } catch {
    throw new ClassError("offline");
  }
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new ClassError(body?.error || `http-${res.status}`);
  return body;
}

/** An invite link's start parameter: c + the six-digit code. */
export const classInviteParam = (code) => `c${code}`;

export function classCodeFromParam(param) {
  const m = /^c(\d{6})$/.exec(String(param || ""));
  return m ? m[1] : null;
}

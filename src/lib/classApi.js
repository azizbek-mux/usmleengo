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
  constructor(code, extra = {}) {
    super(code);
    this.code = code;
    Object.assign(this, extra);
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
  if (!res.ok) throw new ClassError(body?.error || `http-${res.status}`, { index: body?.index });
  return body;
}

/** An invite link's start parameter: c + the six-digit code. */
export const classInviteParam = (code) => `c${code}`;

export function classCodeFromParam(param) {
  const m = /^c(\d{6})$/.exec(String(param || ""));
  return m ? m[1] : null;
}

/* ── pictures ─────────────────────────────────────────────────────────── */

/** Where a question's picture lives: the class's own ("c:<id>") or the app's. */
export function imageUrl(img) {
  if (!img) return null;
  if (img.startsWith("c:")) return `${RATING_API}/class/img/${img.slice(2)}`;
  return `${import.meta.env.BASE_URL}img/${img}`;
}

const MAX_SIDE = 1280;
const MAX_BYTES = 330 * 1024;

/**
 * Shrink a picture on the phone before it is sent: at most 1280 px on its
 * long side, WebP where the phone can make it (JPEG where it cannot, as on
 * older iPhones), and smaller again until it fits the server's limit.
 */
export async function compressImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new ClassError("image"));
      i.src = url;
    });
    let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; // transparent PNGs would turn black as JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let dataUrl = canvas.toDataURL("image/webp", 0.8);
      if (!dataUrl.startsWith("data:image/webp")) dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const comma = dataUrl.indexOf(",");
      const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
      const data = dataUrl.slice(comma + 1);
      if (data.length * 0.75 <= MAX_BYTES) return { mime, data };
      scale *= 0.75;
    }
    throw new ClassError("image-too-large");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrink and upload a picture for a class. Resolves to its reference, "c:<id>". */
export async function uploadImage(classId, file) {
  const { mime, data } = await compressImage(file);
  const r = await classCall("image", { classId, mime, data });
  return r.img;
}

/* ── questions ────────────────────────────────────────────────────────── */

/** A usmleengo bank question, copied into a teacher's package. */
export function bankToClass(q) {
  const base = { id: `b-${q.id}`.slice(0, 40), q: q.q || "", explain: q.explain || "", topic: q.topic || "" };
  if (q.img) base.img = q.img;
  if (q.type === "gap") return { ...base, type: "typed", answer: q.answer, accept: q.accept || [q.answer] };
  return { ...base, type: "choice", options: [...q.options], answer: q.answer };
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * A class question as the quiz screen shows it. Options are shuffled, and
 * `order` remembers where each came from, so the answer handed in names
 * the option the teacher wrote, not its place on this phone's screen.
 */
export function toQuizQuestion(cq) {
  const base = {
    id: cq.id,
    topic: cq.topic || "",
    hideTopic: !cq.topic,
    q: cq.q || "",
    explain: cq.explain || "",
    img: cq.img ? imageUrl(cq.img) : undefined,
    classQuestion: true,
  };
  if (cq.type === "choice") {
    const order = shuffle(cq.options.map((_, i) => i));
    return { ...base, type: "binary", options: order.map((i) => cq.options[i]), answer: order.indexOf(cq.answer), order };
  }
  return { ...base, type: "gap", answer: cq.answer, accept: cq.accept };
}

/** A round from a package: every question, in a fresh order. */
export const packageRound = (questions) => shuffle(questions).map(toQuizQuestion);

// @usmleengo_bot's own side: what it says back.
//
// Telegram sends every message the bot receives here (a webhook, set up
// once through /bot/setup). These are understood:
//
//   /start      a welcome and a button that opens the app
//   /format     how to write questions, with an example
//   a document  a teacher's question file: kept for two days under a
//               random token, with a button that opens the app on it —
//               the app then reads it on the phone (see src/lib/qfiles.js)
//   a message   questions typed or pasted into the chat, in the same
//               format, or quizzes (Telegram polls) made here or forwarded:
//               they gather in one list until the teacher opens it
//
// A file itself stays on Telegram's servers; only its id is kept. Either
// way, only the person who sent it can have it back (see fetchUpload).

import { FORMAT_EXAMPLE, parseQuestions } from "../../src/lib/qformat.js";
import { playerKey } from "../../src/lib/scorecard.js";

export const APP_LINK = "https://t.me/usmleengo_bot/study";
const FILE_TYPES = /\.(docx|pdf|html?|txt)$/i;
const MAX_FILE = 20 * 1024 * 1024; // what a bot may download from Telegram
const KEEP_SECONDS = 2 * 86400;
// A list of typed questions: room for a full package, about 300 questions.
const MAX_TEXT = 100000;
export const TEXT_NAME = "Telegram questions.txt";
// Telegram sends a long paste as several messages, a moment apart. A piece
// with no question number of its own joins the list only that soon after.
const JOIN_SECONDS = 60;
// Thirty quizzes forwarded at once arrive as thirty messages. The bot
// answers once, when none has come for this long.
const QUIET_MS = 3000;
const sleepFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const hex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function telegramApi(env, method, body) {
  return fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const openButton = (text, url = APP_LINK) => ({ inline_keyboard: [[{ text, url }]] });

const WELCOME = [
  "<b>usmleengo</b> 🩺",
  "6,300+ USMLE quizzes, Medical English flashcards, live games with friends, and classrooms.",
  "",
  "<b>Teachers:</b> type or paste your questions here, forward me quizzes, or send a file — Word, PDF, web page or text — and I'll turn them into a package for your class. Send /format to see how to write them.",
].join("\n");

/** Old tokens go as new ones come. */
const prune = (env, now) =>
  env.DB.prepare(`DELETE FROM uploads WHERE created_at < ?1`).bind(Math.floor(now / 1000) - KEEP_SECONDS).run();

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function welcome(env, chat_id) {
  return telegramApi(env, "sendMessage", { chat_id, parse_mode: "HTML", text: WELCOME, reply_markup: openButton("Open usmleengo") });
}

const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

/**
 * A Telegram poll, written out in the question format. A quiz made in this
 * chat carries its right answer and explanation; a forwarded one only once
 * it is closed — Telegram keeps them from bots until then — so without one
 * it arrives with no answer marked, for the teacher to tap in the app.
 */
export function pollText(poll, number) {
  const lines = [`${number}. ${oneLine(poll.question)}`];
  (poll.options || []).forEach((o, i) => lines.push(`${String.fromCharCode(65 + i)}) ${oneLine(o.text)}`));
  if (Number.isInteger(poll.correct_option_id)) lines.push(`Answer: ${String.fromCharCode(65 + poll.correct_option_id)}`);
  if (poll.explanation) lines.push(`Explanation: ${oneLine(poll.explanation)}`);
  return lines.join("\n");
}

// The sender's list still open for more: not yet opened in the app, and
// added to in the last two days (created_at is when it last grew).
const OPEN_LIST = "owner = ?1 AND text IS NOT NULL AND opened = 0 AND created_at >= ?2";

/**
 * Questions sent into the chat — typed, pasted or as quizzes. Everything a
 * teacher sends goes into one list until they open it in the app. Each
 * addition is one statement, so messages arriving together can't overwrite
 * each other; the reply comes once they stop, saying how many questions the
 * list holds — counted with the app's own reader, so the number matches.
 */
async function takeText(env, msg, now, { text: given, poll, later, sleep }) {
  const chat_id = msg.chat.id;
  const owner = playerKey(msg.from.id);
  const at = Math.floor(now / 1000);
  const { results } = await env.DB.prepare(`
    SELECT token, text, size, created_at FROM uploads WHERE ${OPEN_LIST}
    ORDER BY created_at DESC LIMIT 1`).bind(owner, at - KEEP_SECONDS).all();
  const open = results[0] || null;
  const text = poll ? pollText(poll, (open ? parseQuestions([{ text: open.text }]).questions.length : 0) + 1) : given;

  // A message with no question in it joins a list only as the next piece of
  // a long paste; anything else ("hello") gets the welcome.
  if (!poll && !parseQuestions([{ text }]).questions.length && !(open && at - open.created_at <= JOIN_SECONDS)) {
    return welcome(env, chat_id);
  }
  if (open && open.size + 1 + text.length > MAX_TEXT) {
    return telegramApi(env, "sendMessage", {
      chat_id,
      text: "This list is full. Open it and add its questions to a class — then send the rest, and they'll start a new list.",
      reply_markup: openButton("Review the questions", `${APP_LINK}?startapp=f${open.token}`),
    });
  }
  // Start a list if none is open, or else add to the open one.
  let rows = (await env.DB.prepare(`
    INSERT INTO uploads (token, owner, file_id, file_name, size, created_at, text)
    SELECT ?3, ?1, '', ?4, ?5, ?6, ?7
    WHERE NOT EXISTS (SELECT 1 FROM uploads WHERE ${OPEN_LIST})
    RETURNING token, size`).bind(owner, at - KEEP_SECONDS, hex(16), TEXT_NAME, text.length, at, text).all()).results;
  if (rows.length) await prune(env, now);
  else {
    rows = (await env.DB.prepare(`
      UPDATE uploads SET text = text || char(10) || ?3, size = size + 1 + ?4, created_at = ?5
      WHERE token = (SELECT token FROM uploads WHERE ${OPEN_LIST} ORDER BY created_at DESC LIMIT 1)
      RETURNING token, size`).bind(owner, at - KEEP_SECONDS, text, text.length, at).all()).results;
  }
  if (!rows.length) return; // the list was opened a moment ago; the next message starts a new one
  const hiddenAnswer = poll?.type === "quiz" && !Number.isInteger(poll.correct_option_id);
  return later(answerWhenQuiet(env, chat_id, rows[0], hiddenAnswer, sleep));
}

/**
 * The reply to a list, once nothing more has come for a moment. The list's
 * size changes with every addition, so if it has changed, a later message
 * is still arriving and will answer instead.
 */
async function answerWhenQuiet(env, chat_id, { token, size }, hiddenAnswer, sleep) {
  await sleep(QUIET_MS);
  const { results } = await env.DB.prepare(`SELECT text, size FROM uploads WHERE token = ?1`).bind(token).all();
  const list = results[0];
  if (!list || list.size !== size) return;
  const { questions } = parseQuestions([{ text: list.text }]);
  const toFix = questions.filter((q) => q.problem).length;
  await telegramApi(env, "sendMessage", {
    chat_id,
    parse_mode: "HTML",
    text: [
      `This list has <b>${plural(questions.length, "question")}</b>${toFix ? ` — ${toFix} to fix in the app` : ""}.`,
      ...(hiddenAnswer
        ? ["Telegram doesn't show bots the right answer of a forwarded quiz until it's closed, so tap the right option in the app."]
        : []),
      "Send more and they'll join it, or tap below to add them to a class.",
    ].join("\n"),
    reply_markup: openButton("Review the questions", `${APP_LINK}?startapp=f${token}`),
  });
}

/**
 * One update from Telegram. Always answers 200, or Telegram retries it.
 * `ctx` is the Worker's: a list's reply is sent after the response, through
 * ctx.waitUntil. `sleep` is there for the tests.
 */
export async function handleBot(request, env, now = Date.now(), ctx = null, sleep = sleepFor) {
  const later = (work) => (ctx?.waitUntil ? ctx.waitUntil(work) : work);
  if (!env.WEBHOOK_SECRET || request.headers.get("x-telegram-bot-api-secret-token") !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  let update;
  try { update = await request.json(); } catch { return new Response("ok"); }
  const msg = update?.message;
  // Only one-to-one chats: in a group the bot stays quiet.
  if (!msg || msg.chat?.type !== "private" || !msg.from) return new Response("ok");
  const chat_id = msg.chat.id;

  if (msg.document) {
    const name = String(msg.document.file_name || "questions.txt").slice(0, 120);
    if (!FILE_TYPES.test(name)) {
      await telegramApi(env, "sendMessage", {
        chat_id,
        text: "I can read Word (.docx), PDF, web pages (.html) and text (.txt) files. An old Word file (.doc)? Save it as .docx first.",
      });
    } else if ((msg.document.file_size || 0) > MAX_FILE) {
      await telegramApi(env, "sendMessage", { chat_id, text: "That file is over 20 MB — too large for me to fetch. Split it, or save it without pictures." });
    } else {
      const token = hex(16);
      await env.DB.prepare(`
        INSERT INTO uploads (token, owner, file_id, file_name, size, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
        .bind(token, playerKey(msg.from.id), msg.document.file_id, name, msg.document.file_size || 0, Math.floor(now / 1000)).run();
      await prune(env, now);
      await telegramApi(env, "sendMessage", {
        chat_id,
        parse_mode: "HTML",
        text: `Got <b>${escapeHtml(name)}</b>. Tap below to see the questions in it and add them to one of your classes.`,
        reply_markup: openButton("Review the questions", `${APP_LINK}?startapp=f${token}`),
      });
    }
  } else if (/^\/format\b/.test(msg.text || "")) {
    await telegramApi(env, "sendMessage", {
      chat_id,
      parse_mode: "HTML",
      text: [
        "Number each question, put its options under it (up to ten, A to J), then the answer. A question without options is typed.",
        "",
        `<pre>${escapeHtml(FORMAT_EXAMPLE)}</pre>`,
        "",
        "Type or paste them here as a message — as many messages as you like — or send them as a file. Pictures in Word files are taken with the question they sit under.",
        "",
        "Quizzes work too: forward them here, or tap <b>Make a quiz</b> below to write one. A forwarded quiz's right answer stays hidden from me until the quiz is closed — you'll tap it in the app.",
      ].join("\n"),
      // Telegram's own quiz maker, which private chats only offer through a bot's button.
      reply_markup: { keyboard: [[{ text: "Make a quiz", request_poll: { type: "quiz" } }]], resize_keyboard: true, is_persistent: true },
    });
  } else if (msg.text && !msg.text.startsWith("/")) {
    await takeText(env, msg, now, { text: msg.text, later, sleep });
  } else if (msg.poll?.question && msg.poll.options?.length) {
    await takeText(env, msg, now, { poll: msg.poll, later, sleep });
  } else if (msg.photo) {
    await telegramApi(env, "sendMessage", {
      chat_id,
      text: "I can't add photos sent here. Put the picture in a Word file with its question, or add it to the question in the app.",
    });
  } else {
    await welcome(env, chat_id);
  }
  return new Response("ok");
}

/**
 * A file sent to the bot, handed back to the person who sent it and no one
 * else, streamed straight through from Telegram — or a list of typed
 * questions, handed back as a text file.
 */
export async function fetchUpload(env, me, token, now = Date.now()) {
  if (!/^[0-9a-f]{32}$/.test(String(token || ""))) return { status: 400, body: { error: "token" } };
  const { results } = await env.DB.prepare(`SELECT * FROM uploads WHERE token = ?1`).bind(token).all();
  const up = results[0];
  if (!up || up.created_at < Math.floor(now / 1000) - KEEP_SECONDS) return { status: 404, body: { error: "no-file" } };
  if (up.owner !== me.key) return { status: 403, body: { error: "not-yours" } };
  if (up.text !== null && up.text !== undefined) {
    // Typed questions: opening the list closes it, so the next message starts a new one.
    await env.DB.prepare(`UPDATE uploads SET opened = 1 WHERE token = ?1`).bind(token).run();
    return {
      response: new Response(up.text, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-file-name": encodeURIComponent(up.file_name),
          "access-control-expose-headers": "x-file-name",
          "cache-control": "no-store",
        },
      }),
    };
  }
  const info =await (await telegramApi(env, "getFile", { file_id: up.file_id })).json();
  if (!info?.ok) return { status: 502, body: { error: "telegram-file" } };
  const file = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${info.result.file_path}`);
  if (!file.ok) return { status: 502, body: { error: "telegram-file" } };
  return {
    response: new Response(file.body, {
      headers: {
        "content-type": "application/octet-stream",
        "x-file-name": encodeURIComponent(up.file_name),
        "access-control-expose-headers": "x-file-name",
        "cache-control": "no-store",
      },
    }),
  };
}

/** Point Telegram at this Worker and list the bot's commands. Run once, with the setup key. */
export async function setupBot(request, env) {
  if (!env.WEBHOOK_SECRET || request.headers.get("x-setup-key") !== env.WEBHOOK_SECRET) {
    return { status: 403, body: { error: "forbidden" } };
  }
  const url = new URL("/bot", request.url).href;
  const hook = await (await telegramApi(env, "setWebhook", {
    url, secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message"], drop_pending_updates: true,
  })).json();
  const commands = await (await telegramApi(env, "setMyCommands", {
    commands: [
      { command: "start", description: "Open usmleengo" },
      { command: "format", description: "How to write a question file" },
    ],
  })).json();
  return { status: 200, body: { webhook: hook, commands } };
}

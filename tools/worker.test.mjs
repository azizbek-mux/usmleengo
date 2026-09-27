// The rating server, run for real: the Worker's own code against an actual
// SQLite database (node:sqlite — the engine D1 is built on), with Telegram
// launch data signed by a made-up bot token.

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const T = await import(new URL("../worker/src/telegram.js", import.meta.url).href);
const B = await import(new URL("../worker/src/board.js", import.meta.url).href);
const W = await import(new URL("../worker/src/index.js", import.meta.url).href);
const S = await import(new URL("../src/lib/scorecard.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

/** D1's interface over node:sqlite, counting what D1 would bill. */
function mockD1() {
  const db = new DatabaseSync(":memory:");
  db.exec(B.SCHEMA);
  const stats = { reads: 0, writes: 0 };
  return {
    db, stats,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async run() {
          const r = db.prepare(sql).run(...args);
          stats.writes += Number(r.changes);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
        async all() {
          const results = db.prepare(sql).all(...args);
          stats.reads += results.length;
          return { results };
        },
      };
      return stmt;
    },
  };
}

const TOKEN = "123456789:TEST-token-that-is-not-real";
const NOW = Date.parse("2026-09-27T12:00:00Z");
const TODAY = B.serverToday(NOW);
const sign = (user, { token = TOKEN, authDate = Math.floor(NOW / 1000) - 60, extra = {} } = {}) =>
  T.signInitData({ user: JSON.stringify(user), auth_date: String(authDate), query_id: "AAE1", ...extra }, token);

const score = (patch = {}) => ({
  streak: 5, lastDay: TODAY, xp: 800, answered: 90,
  timing: { binaryMs: 5200, binaryN: 40, gapMs: 11000, gapN: 20 }, ...patch,
});
const sync = (env, cache, body) =>
  W.handleSync(new Request("https://rating.test/sync", { method: "POST", body: JSON.stringify(body) }), env, cache, NOW);

/* ── Telegram's signature ──────────────────────────────────────────────── */
console.log("\nTelegram's signature");
const aziz = { id: 70001, first_name: "Azizbek", last_name: "Muxtorov", username: "azizbek_muxtorov" };
const good = await sign(aziz);
check("signed launch data is accepted", (await T.verifyInitData(good, TOKEN, NOW))?.user.id === 70001);
check("but not under another bot's token", (await T.verifyInitData(good, "999:other", NOW)) === null);
const tampered = good.replace("Azizbek", "Azizbeq");
check("changing the name after signing breaks it", (await T.verifyInitData(tampered, TOKEN, NOW)) === null);
const otherUser = good.replace("70001", "70002");
check("so does claiming to be someone else", (await T.verifyInitData(otherUser, TOKEN, NOW)) === null);
const old = await sign(aziz, { authDate: Math.floor(NOW / 1000) - 8 * 86400 });
check("launch data older than a week is refused", (await T.verifyInitData(old, TOKEN, NOW)) === null);
const future = await sign(aziz, { authDate: Math.floor(NOW / 1000) + 3600 });
check("and so is launch data from the future", (await T.verifyInitData(future, TOKEN, NOW)) === null);
const withSig = await sign(aziz, { extra: { signature: "ed25519sigAAAA" } });
check("a newer Telegram's extra signature field is part of what is signed",
  (await T.verifyInitData(withSig, TOKEN, NOW))?.user.id === 70001);
check("no hash, no user", (await T.verifyInitData("user=%7B%7D&auth_date=1", TOKEN, NOW)) === null);
check("rubbish is refused", (await T.verifyInitData("not init data", TOKEN, NOW)) === null);

/* ── possible scores ───────────────────────────────────────────────────── */
console.log("\npossible scores");
check("an ordinary score passes", S.checkScore(score(), TODAY).ok);
check("someone who never studied passes", S.checkScore(score({ streak: 0, lastDay: null, xp: 0, answered: 0,
  timing: {} }), TODAY).ok);
check("a streak older than the app does not", !S.checkScore(score({ streak: 500 }), TODAY).ok);
check("more XP than the answers allow does not", !S.checkScore(score({ xp: 90 * 15 + 1 }), TODAY).ok);
check("more timings than answers does not", !S.checkScore(score({ answered: 50 }), TODAY).ok);
check("an impossible pace does not", !S.checkScore(score({ timing: { binaryMs: 100, binaryN: 5, gapMs: 0, gapN: 0 } }), TODAY).ok);
check("fractions and negatives do not", !S.checkScore(score({ xp: 10.5 }), TODAY).ok && !S.checkScore(score({ xp: -1 }), TODAY).ok);
check("text where a number belongs does not", !S.checkScore(score({ xp: "800" }), TODAY).ok);

/* ── syncing ───────────────────────────────────────────────────────────── */
console.log("\nsyncing");
const d1 = mockD1();
const env = { DB: d1, BOT_TOKEN: TOKEN };
const cache = B.snapshotCache();

let r = await sync(env, cache, { initData: good, score: score() });
const count = () => d1.db.prepare("SELECT COUNT(*) n FROM players").get().n;
check("a player from Telegram is stored on their first sync", r.status === 200 && count() === 1);
check("and ranked", r.body.ranked === true && r.body.me.overall.place === 1 && r.body.me.overall.total === 1);
const writesBefore = d1.stats.writes;
await sync(env, cache, { initData: good, score: score() });
check("sending the same numbers again writes nothing", d1.stats.writes === writesBefore);
await sync(env, cache, { initData: good, score: score({ xp: 815, answered: 91 }) });
check("new numbers are written", d1.stats.writes === writesBefore + 1 &&
  d1.db.prepare("SELECT xp FROM players").get().xp === 815);
const stored = JSON.stringify(d1.db.prepare("SELECT * FROM players").all());
check("the raw Telegram id is never stored", !stored.includes("70001"));
check("the name and username are", stored.includes("Azizbek Muxtorov") && stored.includes("azizbek_muxtorov"));

// Eleven more players, each better than the last.
for (let i = 1; i <= 11; i++) {
  const u = { id: 80000 + i, first_name: `Player${i}`, ...(i % 2 ? { username: `player_${i}` } : {}) };
  await sync(env, cache, { initData: await sign(u), score: score({ streak: 5 + i, xp: 800 + i * 50, answered: 100 + i * 10 }) });
}
// And one who is last on every board at once: fewest days, least XP, slowest.
await sync(env, cache, { initData: await sign({ id: 89999, first_name: "Laggard", username: "laggard_md" }),
  score: score({ streak: 1, xp: 100, answered: 100, timing: { binaryMs: 20000, binaryN: 10, gapMs: 0, gapN: 0 } }) });
check("everyone who opens the app is on the board", count() === 13);

cache.clear();
r = await sync(env, cache, { initData: good, score: score({ xp: 815, answered: 91 }) });
check("each person sees their place out of everyone", r.body.me.overall.total === 13 && r.body.me.overall.place === 12,
  JSON.stringify(r.body.me.overall));
check("only ten are listed", r.body.top.overall.length === 10);
const reply = JSON.stringify(r.body);
check("the top ten come with their names", reply.includes("Player11") && reply.includes("Player2"));
check("with the username where there is one, and none where there is not",
  r.body.top.overall.some((x) => x.username === "player_11") && r.body.top.overall.some((x) => x.name === "Player10" && x.username === null));
// The rule: a name or username leaves the server only for someone in the
// top ten of at least one board. (Players tied on one board can all be in
// its top ten while lower down another.)
const listed = new Set(Object.values(r.body.top).flat().flatMap((x) => [x.name, x.username]).filter(Boolean));
const named = new Set(reply.match(/Player\d+|player_\d+|Laggard|laggard_md|Azizbek|azizbek_muxtorov/g) || []);
check("a name or username leaves the server only for someone in a top ten",
  [...named].every((n) => listed.has(n)), [...named].filter((n) => !listed.has(n)).join());
check("so someone last on every board is never named", !reply.includes("Laggard") && !reply.includes("laggard_md"));
check("and the viewer's own name and username never come back from the server",
  !reply.includes("Azizbek") && !reply.includes("azizbek_muxtorov"));
check("the viewer's own row, when listed, carries no name from the server",
  r.body.top.overall.filter((x) => x.isMe).every((x) => x.name === null));

// The viewer is ranked on the score they just sent, not the stored one.
r = await sync(env, cache, { initData: good, score: score({ streak: 30, xp: 9000, answered: 900 }) });
check("a player's own place moves the moment they send a better score", r.body.me.overall.place === 1);
check("and they appear in the top ten, marked as themselves", r.body.top.overall[0].isMe === true);

/* ── the web, and bad requests ─────────────────────────────────────────── */
console.log("\nthe web, and bad requests");
const before = count();
r = await sync(env, cache, { score: score({ streak: 9, xp: 1200, answered: 150 }) });
check("a browser visitor is shown where they would be", r.body.ranked === false && Number.isInteger(r.body.me.overall.place));
check("but never stored", count() === before && r.body.notStored === "not opened from Telegram");
r = await sync(env, cache, { initData: tampered, score: score() });
check("forged Telegram data is not stored", count() === before && r.body.notStored === "Telegram data did not verify");
check("but still gets the board rather than an error", r.status === 200 && r.body.top.overall.length === 10);
r = await sync(env, cache, { initData: await sign({ id: 90001, first_name: "Cheat" }), score: score({ xp: 999999 }) });
check("an impossible score from a real player is not stored", count() === before && /XP/.test(r.body.notStored));
r = await sync({ DB: d1 }, cache, { initData: good, score: score() });
check("a server missing its token says so", r.body.notStored === "the server has no BOT_TOKEN");
r = await sync(env, cache, {});
check("asking for the board alone works", r.status === 200 && !r.body.notStored);

console.log("\nthe snapshot");
const c2 = B.snapshotCache();
const reads0 = d1.stats.reads;
await c2.get(d1, NOW);
await c2.get(d1, NOW + 30000);
check("the field is read at most once a minute", d1.stats.reads - reads0 === count());
await c2.get(d1, NOW + B.SNAPSHOT_MS + 1);
check("and read again after that", d1.stats.reads - reads0 === 2 * count());

/* ── the Worker itself ─────────────────────────────────────────────────── */
console.log("\nthe Worker itself");
const worker = W.default;
const call = (path, init = {}) => worker.fetch(new Request(`https://rating.test${path}`, {
  ...init, headers: { origin: "https://azizbek-mux.github.io", ...(init.headers || {}) } }), env);
let res = await call("/sync", { method: "OPTIONS" });
check("a preflight is answered", res.status === 204);
res = await call("/sync", { method: "POST", body: JSON.stringify({ score: score() }) });
check("the app's origin is allowed to read the reply",
  res.headers.get("access-control-allow-origin") === "https://azizbek-mux.github.io" && res.status === 200);
check("and the reply is JSON", Array.isArray((await res.json()).top.overall));
res = await call("/sync", { method: "POST", body: "x".repeat(9000) });
check("an oversized body is refused", res.status === 413);
res = await call("/sync", { method: "POST", body: "{not json" });
check("a body that is not JSON is refused", res.status === 400);
check("anything else is not found", (await call("/elsewhere")).status === 404);

console.log("\nthe schema");
const squash = (s) => s.replace(/--.*$/gm, "").replace(/\s+/g, " ").replace(/;/g, "").trim();
check("schema.sql matches the schema the code uses",
  squash(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8")) === squash(B.SCHEMA));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

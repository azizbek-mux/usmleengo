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
          // An upsert … RETURNING hands back the rows it wrote, and D1 bills
          // them as written, not read.
          if (sql.toUpperCase().includes("RETURNING")) stats.writes += results.length;
          else stats.reads += results.length;
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

// A score as the app sends it. Points (hundredths, see rating.js) are given
// per player, so that the players in these tests differ on the board.
const score = (patch = {}) => ({
  streak: 5, lastDay: TODAY, answered: 90, points: 80000,
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
check("someone who never studied passes", S.checkScore(score({ streak: 0, lastDay: null, points: 0, answered: 0,
  timing: {} }), TODAY).ok);
check("a streak older than the app does not", !S.checkScore(score({ streak: 500 }), TODAY).ok);
check("more points than the answers allow does not", !S.checkScore(score({ points: 3000 * 90 + 1 }), TODAY).ok && S.checkScore(score({ points: 3000 * 90 }), TODAY).ok);
check("more timings than answers does not", !S.checkScore(score({ answered: 50 }), TODAY).ok);
check("an impossible pace does not", !S.checkScore(score({ timing: { binaryMs: 100, binaryN: 5, gapMs: 0, gapN: 0 } }), TODAY).ok);
check("fractions and negatives do not", !S.checkScore(score({ points: 10.5 }), TODAY).ok && !S.checkScore(score({ points: -1 }), TODAY).ok);
check("text where a number belongs does not", !S.checkScore(score({ points: "800" }), TODAY).ok);
check("points come through as they were sent", S.checkScore(score({ points: 4200 }), TODAY).score.points === 4200);
{
  const old = score();
  delete old.points;
  const c = S.checkScore(old, TODAY);
  check("an app from before points sends none, and passes with none", c.ok && c.score.points === null);
  const older = S.checkScore({ ...score(), xp: 999999, credit: 5, fluent: 5 }, TODAY);
  check("what an older app sent - XP, credit - is ignored", older.ok && !("xp" in older.score) && !("credit" in older.score) && older.score.points === 80000);
}
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
await sync(env, cache, { initData: good, score: score({ points: 81500, answered: 91 }) });
check("new numbers are written", d1.stats.writes === writesBefore + 1 &&
  d1.db.prepare("SELECT points FROM players").get().points === 81500, `writes +${d1.stats.writes - writesBefore}, points ${d1.db.prepare("SELECT points FROM players").get().points}`);
const stored = JSON.stringify(d1.db.prepare("SELECT * FROM players").all());
check("the raw Telegram id is never stored", !stored.includes("70001"));
check("the name and username are", stored.includes("Azizbek Muxtorov") && stored.includes("azizbek_muxtorov"));

// Eleven more players, each better than the last.
for (let i = 1; i <= 11; i++) {
  const u = { id: 80000 + i, first_name: `Player${i}`, ...(i % 2 ? { username: `player_${i}` } : {}) };
  await sync(env, cache, { initData: await sign(u), score: score({ streak: 5 + i, points: 80000 + i * 5000, answered: 100 + i * 10 }) });
}
// And one who is last on every board at once: fewest days, fewest points.
await sync(env, cache, { initData: await sign({ id: 89999, first_name: "Laggard", username: "laggard_md" }),
  score: score({ streak: 1, points: 10000, answered: 100, timing: { binaryMs: 20000, binaryN: 10, gapMs: 0, gapN: 0 } }) });
// Each then earns a little more, in proportion, so that this week's board is
// not all ties; the last one earns the least.
for (let i = 1; i <= 11; i++) {
  const u = { id: 80000 + i, first_name: `Player${i}`, ...(i % 2 ? { username: `player_${i}` } : {}) };
  await sync(env, cache, { initData: await sign(u), score: score({ streak: 5 + i, points: 80000 + i * 5000 + i * 300, answered: 100 + i * 10 }) });
}
await sync(env, cache, { initData: await sign({ id: 89999, first_name: "Laggard", username: "laggard_md" }),
  score: score({ streak: 1, points: 10050, answered: 100, timing: { binaryMs: 20000, binaryN: 10, gapMs: 0, gapN: 0 } }) });
check("everyone who opens the app is on the board", count() === 13);

cache.clear();
r = await sync(env, cache, { initData: good, score: score({ points: 81500, answered: 91 }) });
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
r = await sync(env, cache, { initData: good, score: score({ streak: 30, points: 900000, answered: 900 }) });
check("a player's own place moves the moment they send a better score", r.body.me.overall.place === 1);
check("and they appear in the top ten, marked as themselves", r.body.top.overall[0].isMe === true);

/* ── the web, and bad requests ─────────────────────────────────────────── */
console.log("\nthe web, and bad requests");
const before = count();
r = await sync(env, cache, { score: score({ streak: 9, points: 120000, answered: 150 }) });
check("a browser visitor is shown where they would be", r.body.ranked === false && Number.isInteger(r.body.me.overall.place));
check("but never stored", count() === before && r.body.notStored === "not opened from Telegram");
r = await sync(env, cache, { initData: tampered, score: score() });
check("forged Telegram data is not stored", count() === before && r.body.notStored === "Telegram data did not verify");
check("but still gets the board rather than an error", r.status === 200 && r.body.top.overall.length === 10);
r = await sync(env, cache, { initData: await sign({ id: 90001, first_name: "Cheat" }), score: score({ points: 9999999 }) });
check("an impossible score from a real player is not stored", count() === before && /points/.test(r.body.notStored));
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

/* ── this week ─────────────────────────────────────────────────────────── */
console.log("\nthis week");
{
  const R = await import(new URL("../src/lib/rating.js", import.meta.url).href);
  const db = mockD1();
  const MON = R.dayIndex("2026-09-28");
  const at = (day, hour = 12) => (day * 86400 + hour * 3600) * 1000;
  check("2026-09-28 is a Monday, the first day of its week", R.weekdayOf(MON) === 0 && R.weekOf(MON - 1) === R.weekOf(MON) - 1);
  const who = (key, name) => ({ key, name, username: null });
  const sc = (lastDay, points, binaryMs, binaryN) => ({
    streak: 3, lastDay, answered: binaryN, timing: { binaryMs, binaryN, gapMs: 0, gapN: 0 }, points,
  });

  // Aziz played last week, then Monday and Wednesday this week.
  await B.savePlayer(db, who("a", "Aziz"), sc(MON - 1, 100000, 5000, 40), at(MON - 1));
  const mon = await B.savePlayer(db, who("a", "Aziz"), sc(MON, 110000, 5000, 50), at(MON));
  check("a new week starts from where the last one ended", mon.base_points === 100000, String(mon.base_points));
  const wed = await B.savePlayer(db, who("a", "Aziz"), sc(MON + 2, 130000, 4800, 60), at(MON + 2));
  check("and keeps that start all week", wed.base_points === 100000);
  check("each day studied is counted", R.daysIn(wed.week_days) === 2);
  // Bek played only last week. Dilnoza is new this week, and earns a little.
  await B.savePlayer(db, who("b", "Bek"), sc(MON - 2, 500000, 4000, 300), at(MON - 2));
  await B.savePlayer(db, who("d", "Dilnoza"), sc(MON + 2, 5000, 3000, 5), at(MON + 2));
  await B.savePlayer(db, who("d", "Dilnoza"), sc(MON + 2, 10000, 3000, 9), at(MON + 2, 18));

  const snap = B.snapshotCache();
  const players = await snap.get(db, at(MON + 2, 18));
  const ws = B.weekScore(players.get("a"), R.weekOf(MON), MON + 2);
  check("the week's points are only this week's", ws.points === 30000, JSON.stringify(ws));
  check("and days studied stand in for the streak", ws.streak === 2);

  const wk = B.weekBoard(players, { key: "b" }, MON + 2);
  check("the week ranks only those who studied in it", wk.top.map((r) => r.name).join() === "Aziz,Dilnoza" && wk.me.total === 2,
    JSON.stringify(wk.top.map((r) => [r.name, r.points])));
  check("by points: 300 against 100 (a new player's first points are all this week's)", wk.top[0].points === 300 && wk.top[1].points === 100, JSON.stringify(wk.top.map((r) => r.points)));
  check("someone idle this week has no place in it", wk.me.place === null);
  check("the week ends next Monday at midnight UTC", wk.endsAt === Date.parse("2026-10-05T00:00:00Z"));
  const mine = B.weekBoard(players, { key: "d" }, MON + 2);
  check("a player sees their own week: place, points, days", mine.me.place === 2 && mine.me.points === 100 && mine.me.raw.streak === 1);
  check("and not their own name from the server", mine.top.find((r) => r.isMe).name === null);

  // A week's points can fall as well as rise, and are read as nothing below zero.
  await B.savePlayer(db, who("c", "Cem"), sc(MON - 1, 4000, 5000, 10), at(MON - 1));
  const cMon = await B.savePlayer(db, who("c", "Cem"), sc(MON, 9000, 5000, 20), at(MON));
  check("a new week's points start from where the last one ended", cMon.base_points === 4000);
  const cWed = await B.savePlayer(db, who("c", "Cem"), sc(MON + 2, 12000, 5000, 26), at(MON + 2));
  check("and keep that start all week", cWed.base_points === 4000 && cWed.points === 12000);
  const cWeek = B.weekScore((await B.snapshotCache().get(db, at(MON + 2))).get("c"), R.weekOf(MON), MON + 2);
  check("the week's points are the difference", cWeek.points === 8000);
  await B.savePlayer(db, who("c", "Cem"), { ...sc(MON + 2, 0, 5000, 30), points: null }, at(MON + 2, 20));
  const cOld = (await B.snapshotCache().get(db, at(MON + 2, 20) + B.SNAPSHOT_MS)).get("c");
  check("an app that sends no points leaves what is stored alone", cOld.score.points === 12000 && cOld.score.answered === 30, JSON.stringify(cOld.score));
  // Elyor had no points at all until midweek; his whole history must not become one week's work.
  await B.savePlayer(db, who("e", "Elyor"), sc(MON + 1, 0, 5000, 5), at(MON + 1));
  const eFirst = await B.savePlayer(db, who("e", "Elyor"), sc(MON + 1, 30000, 5000, 8), at(MON + 1, 15));
  check("the first points a player sends start the week level", eFirst.base_points === 30000, String(eFirst.base_points));
  const eLater = await B.savePlayer(db, who("e", "Elyor"), sc(MON + 2, 30600, 5000, 12), at(MON + 2));
  check("and what he does after counts", eLater.points - eLater.base_points === 600);
  await B.snapshotCache().get(db, at(MON + 2));

  const next = await B.savePlayer(db, who("a", "Aziz"), sc(MON + 7, 140000, 4800, 61), at(MON + 7));
  check("next Monday the week starts over", next.base_points === 130000 && R.daysIn(next.week_days) === 1);
  const later = await snap.get(db, at(MON + 7) + B.SNAPSHOT_MS);
  check("and last week's players drop off it",
    B.weekBoard(later, null, MON + 7).top.map((r) => r.name).join() === "Aziz");

  const r2 = await sync({ DB: db, BOT_TOKEN: TOKEN }, B.snapshotCache(), { initData: good, score: score() });
  check("the week comes back with every sync", Array.isArray(r2.body.week?.top) && typeof r2.body.week.endsAt === "number");
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

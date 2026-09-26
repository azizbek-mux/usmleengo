// The path a score takes from the app to the public board: packed into a bot
// start link, checked for plausibility, merged into the board by the build.
// No network — the fetcher only runs its main() when invoked directly.

const S = await import(new URL("../src/lib/scorecard.js", import.meta.url).href);
const F = await import(new URL("./fetch-leaderboard.mjs", import.meta.url).href);
const { dayIndex } = await import(new URL("../src/lib/rating.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const TODAY = dayIndex("2026-09-26");
const good = {
  streak: 12, lastDay: TODAY, xp: 4200, answered: 400,
  timing: { binaryMs: 5200, binaryN: 180, gapMs: 11000, gapN: 90 },
};

console.log("\npacking a score");
const code = S.encodeScore(good);
check("it fits Telegram's 64-character limit", code && code.length <= 64, code);
check("using only characters a start link allows", /^[A-Za-z0-9_-]+$/.test(code));
const decoded = S.decodeScore(code, TODAY);
check("and comes back exactly as sent", decoded.ok &&
  JSON.stringify(decoded.score) === JSON.stringify(good), JSON.stringify(decoded));
const huge = S.encodeScore({ streak: 999, lastDay: TODAY + 900, xp: 9_999_999, answered: 999_999,
  timing: { binaryMs: 60000, binaryN: 999_999, gapMs: 60000, gapN: 999_999 } });
check("even enormous numbers still fit", huge && huge.length <= 64, huge);

console.log("\nrefusing the impossible");
const tweak = (patch) => S.decodeScore(S.encodeScore({ ...good, ...patch }), TODAY);
check("a streak longer than the app has existed", !tweak({ streak: 500 }).ok);
check("more XP than the answers could earn", !tweak({ xp: 400 * 15 + 1 }).ok);
check("but exactly the maximum is fine", tweak({ xp: 400 * 15 }).ok);
check("more timed answers than answers", !tweak({ answered: 100 }).ok);
check("a tapped average under 0.4 seconds",
  !tweak({ timing: { ...good.timing, binaryMs: 150 } }).ok);
check("a last study day in the future", !tweak({ lastDay: TODAY + 5 }).ok);
const edited = code.replace(/_([0-9a-z]+)_/, (m, d) => `_${d === "c" ? "d" : "c"}_`);
check("a hand-edited link fails its checksum", !S.decodeScore(edited, TODAY).ok);
check("a different version is not read", !S.decodeScore("r9_1_2_3", TODAY).ok);
check("garbage is not read", !S.decodeScore("hello", TODAY).ok);
check("asking to leave is understood", S.decodeScore(S.leavePayload(), TODAY).leave === true);

console.log("\nwho a player is");
check("the key is stable", S.playerKey(12345678) === S.playerKey("12345678"));
check("different people get different keys", S.playerKey(12345678) !== S.playerKey(12345679));
check("and the key does not contain the Telegram id", !S.playerKey(12345678).includes("12345678"));
check("a name is the full name as written on Telegram",
  S.displayName({ first_name: "Azizbek", last_name: "Muxtorov" }) === "Azizbek Muxtorov");
check("a first name alone is fine", S.displayName({ first_name: "Aziz" }) === "Aziz");
check("no name at all becomes Player", S.displayName({}) === "Player");
check("control and direction characters are stripped",
  S.displayName({ first_name: "A‮ziz\u0007" }) === "Aziz");
check("a very long name is cut", [...S.displayName({ first_name: "x".repeat(80) })].length === S.NAME_MAX);
check("a username is kept", S.usernameOf({ username: "azizbek_muxtorov" }) === "azizbek_muxtorov");
check("no username is simply none", S.usernameOf({ first_name: "Laylo" }) === null);
check("and nothing that breaks Telegram's rules passes as one",
  S.usernameOf({ username: "no spaces!" }) === null && S.usernameOf({ username: "ab" }) === null);

console.log("\nthe build merging messages");
const msg = (id, from, text, date, chat = "private") => ({
  update_id: id,
  message: { from, chat: { type: chat }, text, date },
});
const aziz = { id: 1001, first_name: "Azizbek", last_name: "Muxtorov", username: "azizbek_muxtorov" };
const bek = { id: 1002, first_name: "Bek" };
const t0 = Math.floor(Date.parse("2026-09-26T08:00:00Z") / 1000);

const board = F.emptyBoard();
const log = F.applyUpdates(board, [
  msg(10, aziz, `/start ${S.encodeScore({ ...good, xp: 1000 })}`, t0),
  msg(11, aziz, `/start ${S.encodeScore(good)}`, t0 + 60),
  msg(12, bek, "/start", t0 + 70),
  msg(13, bek, "hello bot", t0 + 80),
  msg(14, { ...bek, is_bot: true }, `/start ${code}`, t0 + 90),
  msg(15, { id: 1003, first_name: "Group" }, `/start ${code}`, t0 + 100, "group"),
  msg(16, bek, `/start ${code.slice(0, -1)}x`, t0 + 110),
]);
const azizKey = S.playerKey(aziz.id);
check("a valid score goes on the board", board.players[azizKey]?.xp === 4200);
check("the newest message from someone wins", log.accepted === 2 && board.players[azizKey].xp === 4200);
check("a plain /start, a chat message, a bot and a group add nobody",
  Object.keys(board.players).length === 1);
check("a bad checksum is counted as rejected", log.rejected.includes("checksum"));
check("the read position moves past everything seen", board.lastUpdateId === 16);

F.applyUpdates(board, [msg(17, aziz, `/start ${S.encodeScore({ ...good, xp: 10 })}`, t0 - 999)]);
check("a late-arriving older message cannot roll a score back", board.players[azizKey].xp === 4200);

F.applyUpdates(board, [msg(18, aziz, `/start ${S.leavePayload()}`, t0 + 500)]);
check("asking to leave takes you off", !board.players[azizKey]);

console.log("\nwhat gets published");
F.applyUpdates(board, [msg(19, aziz, `/start ${code}`, t0 + 600)]);
const published = JSON.stringify(board);
check("no Telegram user id", !published.includes(String(aziz.id)));
check("the full name is shown", published.includes('"name":"Azizbek Muxtorov"'));
check("with the username", published.includes('"username":"azizbek_muxtorov"'));
F.applyUpdates(board, [msg(20, { id: 1004, first_name: "Laylo" }, `/start ${code}`, t0 + 700)]);
const laylo = board.players[S.playerKey(1004)];
check("someone without a username has no username field at all", laylo && !("username" in laylo));
check("and still no Telegram id anywhere", !JSON.stringify(board).includes('"1004"') && !JSON.stringify(board).includes(":1004"));

console.log("\nreading last build's board back");
const round = F.sanitizeBoard(JSON.parse(published));
check("a real board survives the round trip", JSON.stringify(round.players) === JSON.stringify(JSON.parse(published).players));
const junk = F.sanitizeBoard({
  lastUpdateId: 5,
  players: {
    ok: board.players[azizKey],
    "BAD KEY": board.players[azizKey],
    neg: { ...board.players[azizKey], xp: -1 },
    missing: { name: "x" },
  },
});
check("malformed entries are dropped, not repaired", Object.keys(junk.players).join() === "ok");
const badName = F.sanitizeBoard({ players: { ok: { ...board.players[azizKey], username: "x y", name: "A\u202eB" } } });
check("a bad username read back is dropped, but the player kept",
  badName.players.ok && !("username" in badName.players.ok));
check("and a name read back is cleaned again", badName.players.ok.name === "AB");
check("nonsense in place of a board is an empty board", Object.keys(F.sanitizeBoard("nope").players).length === 0);

console.log("\nthe start command");
check("reads the payload", F.startPayload(`/start ${code}`) === code);
check("with the bot's name attached", F.startPayload(`/start@usmleengo_bot ${code}`) === code);
check("but not a bare /start", F.startPayload("/start") === null);
check("or anything with extra words", F.startPayload(`/start ${code} please`) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

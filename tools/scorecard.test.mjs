// Who a player is on the board: the key they are stored under, and the name
// and username everyone sees if they reach a top ten. Whether a score is
// possible (checkScore) is tested with the server, in worker.test.mjs.

const S = await import(new URL("../src/lib/scorecard.js", import.meta.url).href);

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

console.log("\nthe key");
check("is stable", S.playerKey(12345678) === S.playerKey("12345678"));
check("differs between people", S.playerKey(12345678) !== S.playerKey(12345679));
check("does not contain the Telegram id", !S.playerKey(12345678).includes("12345678"));
check("is nothing for nobody", S.playerKey(null) === null && S.playerKey("") === null);

console.log("\nthe name");
check("is the full name as written on Telegram",
  S.displayName({ first_name: "Azizbek", last_name: "Muxtorov" }) === "Azizbek Muxtorov");
check("a first name alone is fine", S.displayName({ first_name: "Laylo" }) === "Laylo");
check("no name at all becomes Player", S.displayName({}) === "Player");
check("control and direction characters are stripped",
  S.displayName({ first_name: "A‮ziz\u0007" }) === "Aziz");
check("a very long name is cut", [...S.displayName({ first_name: "x".repeat(80) })].length === S.NAME_MAX);

console.log("\nthe username");
check("is kept", S.usernameOf({ username: "azizbek_muxtorov" }) === "azizbek_muxtorov");
check("none is simply none", S.usernameOf({ first_name: "Laylo" }) === null);
check("and nothing that breaks Telegram's rules passes as one",
  S.usernameOf({ username: "no spaces!" }) === null && S.usernameOf({ username: "ab" }) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

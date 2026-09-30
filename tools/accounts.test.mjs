// Two Telegram accounts on one phone open the Mini App in the same webview,
// so they share one localStorage. Progress must not cross from one to the
// other: this runs the real storage.js and deck.js against a phone with a
// single localStorage and one CloudStorage per account, which is how
// Telegram keeps them.

const clouds = { 111: new Map(), 222: new Map(), 333: new Map() };
let current = 111;
let cloudDown = false;
let cloudWrites = 0;

const WebApp = {
  version: "8.0",
  platform: "android",
  initData: "signed",
  initDataUnsafe: { user: { id: 111 } },
  CloudStorage: {
    setItem(k, v, cb) { cloudWrites++; clouds[current].set(k, String(v)); cb(null, true); },
    getItems(keys, cb) {
      if (cloudDown) return cb("offline");
      const out = {};
      for (const k of keys) out[k] = clouds[current].has(k) ? clouds[current].get(k) : "";
      cb(null, out);
    },
    removeItems(keys, cb) { for (const k of keys) clouds[current].delete(k); cb(null, true); },
  },
};
globalThis.window = { Telegram: { WebApp } };

const phone = new Map();
globalThis.localStorage = {
  getItem: (k) => (phone.has(k) ? phone.get(k) : null),
  setItem: (k, v) => phone.set(k, String(v)),
  removeItem: (k) => phone.delete(k),
};

/** Sign in as this account; the app has just been opened, so a fresh copy of each module. */
function open(id, tag) {
  current = id;
  WebApp.initDataUnsafe = { user: { id } };
  return Promise.all([
    import(new URL(`../src/lib/storage.js?${tag}`, import.meta.url).href),
    import(new URL(`../src/lib/deck.js?${tag}`, import.meta.url).href),
  ]).then(([S, D]) => ({ S, D }));
}

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

const q = (n) => ({ id: `topic-slug-${n.toString(36)}`, type: "binary" });
const play = (S, state, n) => { for (let i = 0; i < n; i++) state = S.record(state, q(i), true, 3000); return state; };
const sleep = () => new Promise((r) => setTimeout(r, 0));

/* ── 1. the account that plays keeps its progress under its own key ─────── */

console.log("\nthe first account plays");
const a = await open(111, "a");
let mine = await a.S.loadRemote(a.S.loadLocal());
mine = play(a.S, mine, 27);
a.S.save(mine);
await sleep();
check("it earned points", mine.points > 0, `${mine.points}`);
check("saved under its own key", phone.has("usmle_drops_v1:111"));
check("and not under the shared one", !phone.has("usmle_drops_v1"));

/* ── 2. the second account starts from nothing, not from the first ─────── */

console.log("\nthe second account opens the app on the same phone");
const cloudOf111 = JSON.stringify([...clouds[111]]);
const b = await open(222, "b");
const bLocal = b.S.loadLocal();
check("first paint is its own, empty", bLocal.points === 0 && bLocal.answered === 0, `points ${bLocal.points}`);
const bSettled = await b.S.loadRemote(bLocal);
check("after the cloud read it is still empty", bSettled.points === 0 && bSettled.answered === 0, `points ${bSettled.points}`);
check("the first account's local copy was left alone", JSON.parse(phone.get("usmle_drops_v1:111")).points === mine.points);

let theirs = play(b.S, bSettled, 2);
b.S.save(theirs);
await sleep();
check("its two answers are its own", theirs.answered === 2);
check("the first account's cloud copy is untouched", JSON.stringify([...clouds[111]]) === cloudOf111);
check("the second account's cloud copy holds its two answers, not 27",
  clouds[222].get("usmle_drops_v1__0")?.includes('"answered":2,') && !clouds[222].get("usmle_drops_v1__0")?.includes('"answered":27'));

/* ── 3. and the first account gets its own back ─────────────────────────── */

console.log("\nthe first account comes back");
const a2 = await open(111, "a2");
const back = await a2.S.loadRemote(a2.S.loadLocal());
check("its progress is intact", back.points === mine.points && back.answered === 27, `points ${back.points} answered ${back.answered}`);

/* ── 4. progress written before keys carried an account ─────────────────── */

console.log("\nan update over the old, shared key");
phone.clear();
clouds[333].clear();
{
  // What the old app left: the bare key, holding whoever played last.
  const old = play(a.S, { ...a.S.emptyState }, 40);
  phone.set("usmle_drops_v1", JSON.stringify(old));
  // 333's own cloud has its real progress.
  current = 333;
  const real = play(a.S, { ...a.S.emptyState }, 12);
  await new Promise((resolve) => WebApp.CloudStorage.setItem("usmle_drops_v1", JSON.stringify(real), resolve));
  const c = await open(333, "c");
  const first = c.S.loadLocal();
  check("the shared copy is not handed to an account that can ask the cloud", first.points === 0, `points ${first.points}`);
  const settled = await c.S.loadRemote(first);
  check("the cloud copy is the account's own", settled.points === real.points && settled.answered === 12, `points ${settled.points}`);
}

/* ── 5. a blank start never writes over the cloud ────────────────────────── */

console.log("\nan answer given before the cloud has been read");
phone.clear();
clouds[333].clear();
{
  current = 333;
  const real = play(a.S, { ...a.S.emptyState }, 30);
  await new Promise((resolve) => WebApp.CloudStorage.setItem("usmle_drops_v1", JSON.stringify(real), resolve));
  const d = await open(333, "d");
  const blank = d.S.loadLocal();
  cloudWrites = 0;
  d.S.save(d.S.record(blank, q(1), true, 2000));
  await sleep();
  check("stays off the cloud", cloudWrites === 0, `${cloudWrites} writes`);
  const settled = await d.S.loadRemote(blank);
  check("the cloud copy wins over the blank one", settled.answered === 30, `answered ${settled.answered}`);
  d.S.save(d.S.record(settled, q(2), true, 2000));
  await sleep();
  check("once it has been read, saving goes to the cloud again", cloudWrites > 0);
}

console.log("\nthe cloud cannot be reached at all");
phone.clear();
clouds[333].clear();
{
  current = 333;
  cloudDown = true;
  const e = await open(333, "e");
  const blank = e.S.loadLocal();
  await e.S.loadRemote(blank);
  cloudWrites = 0;
  e.S.save(e.S.record(blank, q(1), true, 2000));
  await sleep();
  check("nothing is written over a copy that could not be looked at", cloudWrites === 0, `${cloudWrites} writes`);
  cloudDown = false;
}

/* ── 6. the flashcard deck is kept apart the same way ───────────────────── */

console.log("\nthe Medical English deck");
phone.clear();
{
  const d1 = await open(111, "f1");
  const deck = d1.D.loadDeckLocal();
  deck.reviews = 40;
  deck.config.newPerDay = 20;
  d1.D.saveDeck(deck);
  check("account one's deck is under its own key", phone.has("usmleengo_english_v1:111") && !phone.has("usmleengo_english_v1"));
  const d2 = await open(222, "f2");
  const other = d2.D.loadDeckLocal();
  check("account two starts with no reviews", other.reviews === 0 && other.config.newPerDay === null, `${other.reviews}`);
}

/* ── 7. everything else that is kept on the phone is per account too ───── */

console.log("\nthe other keys");
const { scoped } = await import(new URL("../src/lib/account.js", import.meta.url).href);
WebApp.initDataUnsafe = { user: { id: 111 } };
const k1 = ["usmle_rating_sent", "usmle_class_share", "usmle_game_seats", "usmle_game_nick"].map(scoped);
WebApp.initDataUnsafe = { user: { id: 222 } };
const k2 = ["usmle_rating_sent", "usmle_class_share", "usmle_game_seats", "usmle_game_nick"].map(scoped);
check("no key is shared between two accounts", k1.every((k, i) => k !== k2[i]));
WebApp.initDataUnsafe = {};
check("outside an account the key is the plain one", scoped("usmle_game_nick") === "usmle_game_nick");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Exercises the real storage.js against a mock CloudStorage that enforces
// Telegram's actual limits: 4096 characters per value, 128 per key, 1024 keys.
// The point is the failure this replaces — an oversized setItem that reports
// an error nobody was checking.

const LIMIT = 4096;
const store = new Map();
let rejected = 0;

globalThis.window = {
  Telegram: {
    WebApp: {
      version: "7.2",
      platform: "ios",
      initData: "",
      CloudStorage: {
        setItem(k, v, cb) {
          if (String(k).length > 128) return cb("key too long");
          if (String(v).length > LIMIT) { rejected++; return cb("value too long"); }
          if (store.size >= 1024 && !store.has(k)) return cb("too many keys");
          store.set(k, String(v));
          cb(null, true);
        },
        getItems(keys, cb) {
          const out = {};
          for (const k of keys) out[k] = store.has(k) ? store.get(k) : "";
          cb(null, out);
        },
        removeItems(keys, cb) { for (const k of keys) store.delete(k); cb(null, true); },
      },
    },
  },
};

const local = new Map();
globalThis.localStorage = {
  getItem: (k) => (local.has(k) ? local.get(k) : null),
  setItem: (k, v) => local.set(k, String(v)),
  removeItem: (k) => local.delete(k),
};

const SRC = new URL("../src/lib/", import.meta.url).href;
const S = await import(SRC + "storage.js");
const { emptyState, loadLocal, loadRemote, record, reset, save } = S;

const KEY = "usmle_drops_v1";
const q = (n) => ({ id: `topic-slug-${n.toString(36)}` });
const sleep = () => new Promise((r) => setTimeout(r, 0));

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

/* ── 1. a realistic amount of progress survives the round trip ─────────── */

let state = { ...emptyState, qtype: "random" };
for (let i = 0; i < 500; i++) state = record(state, q(i), i % 3 !== 0);
const json = JSON.stringify(state);
save(state);
await sleep();

console.log(`\n500 answered questions -> ${json.length} characters ` +
            `(${(json.length / LIMIT).toFixed(1)}x the per-value limit)`);
console.log(`cloud keys written: ${store.size}, oversized writes rejected: ${rejected}`);

check("payload really does exceed one value", json.length > LIMIT, `${json.length}`);
check("nothing was rejected for size", rejected === 0);

const restored = await loadRemote({ ...emptyState });
check("all 500 answers came back", Object.keys(restored.seen).length === 500,
      `got ${Object.keys(restored.seen).length}`);
check("xp came back", restored.xp === state.xp, `${restored.xp} vs ${state.xp}`);
check("streak/count/qtype came back",
      restored.qtype === "random" && restored.count === state.count);

/* ── 2. the old unchunked copy is still honoured (upgrading user) ──────── */

store.clear(); local.clear();
const oldState = { ...emptyState, xp: 640, streak: 7, qtype: "binary", seen: { "a-1": [3, 1] } };
store.set(KEY, JSON.stringify(oldState));                 // written by the old app
const migrated = await loadRemote({ ...emptyState });
check("pre-chunking cloud copy is found", migrated.xp === 640 && migrated.streak === 7,
      `xp ${migrated.xp}`);

// and once the new app saves, the chunked copy takes over
let grown = migrated;
for (let i = 0; i < 300; i++) grown = record(grown, q(i), true);
save(grown);
await sleep();
const afterUpgrade = await loadRemote({ ...emptyState });
check("chunked copy wins after the first new save",
      afterUpgrade.xp === grown.xp && Object.keys(afterUpgrade.seen).length === 301,
      `xp ${afterUpgrade.xp}, seen ${Object.keys(afterUpgrade.seen).length}`);

/* ── 3. a torn write must not drag a user backwards ────────────────────── */

const chunkKeys = [...store.keys()].filter((k) => k.startsWith(`${KEY}__`) && k !== `${KEY}__n`);
console.log(`  (chunked copy occupies ${chunkKeys.length} chunk key(s); dropping the last)`);
store.delete(chunkKeys[chunkKeys.length - 1]);             // lose a real chunk
const torn = await loadRemote({ ...emptyState });
check("torn chunked read is rejected, not half-restored",
      torn.xp !== grown.xp || Object.keys(torn.seen).length !== 301);
check("torn read still falls back to the legacy copy rather than zero",
      torn.xp >= 640, `xp ${torn.xp}`);

/* ── 4. a shrinking payload leaves no stale chunks behind ──────────────── */

store.clear(); local.clear();
let big = { ...emptyState };
for (let i = 0; i < 800; i++) big = record(big, q(i), true);
save(big); await sleep();
const manyChunks = [...store.keys()].filter((k) => k.startsWith(`${KEY}__`) && k !== `${KEY}__n`).length;
save({ ...emptyState, xp: 5 }); await sleep();
const fewChunks = [...store.keys()].filter((k) => k.startsWith(`${KEY}__`) && k !== `${KEY}__n`).length;
check("stale chunks are cleaned up when progress shrinks",
      fewChunks < manyChunks, `${manyChunks} -> ${fewChunks}`);
const small = await loadRemote({ ...emptyState });
check("the shrunk copy reads back correctly", small.xp === 5, `xp ${small.xp}`);

/* ── 5. reset clears both copies ───────────────────────────────────────── */

store.clear(); local.clear();
let played = { ...emptyState };
for (let i = 0; i < 400; i++) played = record(played, q(i), true);
save(played); await sleep();
store.set(KEY, JSON.stringify({ ...emptyState, xp: 9999 }));   // an old copy lurking
reset(); await sleep();
const afterReset = await loadRemote({ ...emptyState });
check("reset clears the chunked copy", Object.keys(afterReset.seen).length === 0,
      `seen ${Object.keys(afterReset.seen).length}`);
check("reset also blanks the legacy copy so it cannot resurrect progress",
      afterReset.xp === 0, `xp ${afterReset.xp}`);

/* ── 6. the same, for the flashcard deck ───────────────────────────────── */

store.clear(); local.clear();
const D = await import(SRC + "deck.js");
let deck = { ...D.emptyDeck, box: {} };
for (let i = 0; i < 3000; i++) deck = D.rate(deck, i, "good");
const encoded = D.saveDeck(deck);
await sleep();
const deckBack = await D.loadDeckRemote({ ...D.emptyDeck, box: {} });
check("3,000 flashcards round-trip through the cloud",
      Object.keys(deckBack.box).length === 3000, `${Object.keys(deckBack.box).length}`);
check("deck review count survives", deckBack.reviews === 3000, `${deckBack.reviews}`);
console.log(`  deck stored in ${[...store.keys()].length} cloud keys ` +
            `(${localStorage.getItem("usmleengo_english_v1").length} characters)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

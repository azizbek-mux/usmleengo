# USMLE Drops

A Duolingo-style micro-quiz Telegram Mini App for USMLE recall. Two question
types, both answerable in about five seconds:

- **Binary** — *"In Addison disease, serum K+ is:"* → Increased / Decreased
- **Fill the gap** — *"Dementia, diarrhea, and dermatitis = deficiency of vitamin \_\_\_"* → B3

The point is not to teach heavy concepts. It is to make one small daily habit
feel like rest rather than work.

## Running cost: $0

| Piece | How | Cost |
|---|---|---|
| Questions | Bundled JSON in the app | free |
| Hosting | GitHub Pages (static build) | free |
| Streaks / XP / progress | Telegram CloudStorage, localStorage fallback | free |
| Backend, database | none — there isn't one | free |
| Bot | BotFather | free |

There is no API key and no server. Topic search runs client-side against the
bundled bank, so it works instantly and offline once loaded.

## Develop

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL in a browser. Outside Telegram everything still works —
progress falls back to `localStorage` and haptics become no-ops.

## Deploy free, in three steps

**1. Push to GitHub.** Create a repo and push this folder.

```bash
git init && git add -A && git commit -m "USMLE Drops" && git branch -M main
```

Then add your remote and push. In the repo, open **Settings → Pages** and set
**Source** to **GitHub Actions**. The included workflow builds and publishes on
every push to `main`. Your app lands at `https://<user>.github.io/<repo>/`.

**2. Create the bot.** In Telegram, message [@BotFather](https://t.me/BotFather):

- `/newbot` — pick a name and username, and keep the token it gives you
- `/newapp` — choose your bot, give the Mini App a title, a 640×360 icon, and
  paste your GitHub Pages URL
- `/setmenubutton` — point the chat's menu button at the same URL so the app
  opens with one tap

**3. Share the link.** BotFather returns a `t.me/<bot>/<app>` link. That link
opens the Mini App directly — post it to your channel.

## Adding questions

Questions are authored one per line in the `.txt` files in `src/data/`, then
compiled into `questions.json`. Never edit `questions.json` or `bank.js` by
hand — they are generated.

```
B|topic|tag,tag|question|CORRECT option|wrong option|explanation
G|topic|tag,tag|question with ___|answer|extra,accepted,spellings|explanation
```

```
B|Addison disease|endocrine,adrenal|In Addison disease, serum K+ is:|Increased|Decreased|Low aldosterone means less K+ excreted.
G|Niacin deficiency|biochem,vitamins|Dementia, diarrhea and dermatitis = deficiency of vitamin ___|B3|niacin,vitamin b3|Pellagra — the 3 D's.
```

Then compile:

```bash
npm run compile
```

`npm run dev` and `npm run build` compile automatically, so in practice you
just edit a `.txt` and reload.

The compiler enforces the rules so bad questions cannot reach the app:

- exactly 7 pipe-separated fields, and a non-empty topic, question and explanation
- binary questions need two different options and must not contain `___`
- gap questions must contain `___`
- **the correct option is written first** — the app shuffles at runtime, so
  authoring it first stays readable without training users to tap one side
- **the stem may not contain the answer** as a whole word, which would make the
  question answer itself
- near-duplicate questions are detected and skipped automatically

Any violation fails the build with the offending `file:line`.

## Where the questions came from

The bank was derived from the reference PDFs and the extracted `bank.json` in
this folder. Source vignettes were reduced to their underlying facts and
rewritten as original one-line questions — no source stems, options or
explanations are reproduced in the app. A 500-character clinical vignette
could not become a five-second tap in any case.

`tools/` holds only the compiler. The extraction scripts were scratch work and
are not part of the build.

## How it works

| File | Role |
|---|---|
| `src/data/*.txt` | Every question. The only files you edit to add content. |
| `tools/compile.mjs` | Validates and compiles the `.txt` files into `questions.json`. |
| `src/lib/match.js` | Free-text topic search — aliases, stemming, scoring, suggestions. |
| `src/lib/session.js` | Round building, option shuffling, spaced repetition, answer grading. |
| `src/lib/storage.js` | Streak, XP and progress across CloudStorage + localStorage. |
| `src/lib/telegram.js` | WebApp SDK wrapper; every call degrades outside Telegram. |

Three details worth knowing:

**Options are shuffled at runtime.** Without it users would learn to always tap
the left button instead of the medicine. `present()` in `session.js` reorders
the options and remaps the answer index.

**Wrong answers come back.** `weight()` in `session.js` favours unseen questions
and ones you have missed, so a question you got wrong five times appears in
roughly 66% of rounds against a 25% baseline.

**Typos are forgiven in proportion to length.** `grade()` allows one edit for
answers of 6+ characters and two for 10+, but short answers like `B3` or `17`
must match exactly, since there one character is the whole answer.

## Roadmap ideas

- More questions — the bank ships with 1,345 across 20 subject files
- Per-subject progress rings on the home screen
- A daily reminder push via the bot (needs a tiny server or a free cron service)
- Leaderboard among friends (needs a backend, so no longer free)

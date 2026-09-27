# usmleengo

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
| Rating | Cloudflare Worker + D1 database, free plan (`worker/`) | free |
| Multiplayer | Durable Objects on the same Worker, free plan | free |
| Announcement timer | cron-job.org, free plan | free |
| Bot | BotFather | free |

Everything about studying needs no server: topic search runs client-side
against the bundled bank, so it works instantly and offline once loaded. The
one server holds the rating and the multiplayer games, which exist only
because ranking every player, and playing live together, need somewhere to
meet; if it is ever down, studying carries on and only those screens say it
cannot be reached.

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
git init && git add -A && git commit -m "usmleengo" && git branch -M main
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

## Announcing something in the app

Post it on the channel with **`#usmleengo`** in the text. Within about an hour
it shows as a card at the top of both home screens, linking back to the post.

    New USMLE course 🎓 #usmleengo
    Ten weeks, starts Monday. Message me to join.

The first line becomes the card's title, the rest becomes the body, and the
post's photo becomes the thumbnail. The `#usmleengo` tag itself is stripped
from what people see.

**To change it** — post a newer `#usmleengo` message. The most recent one
always wins.

**To take it down** — delete the post, or wait: a card stops showing 10 days
after it was posted, so a forgotten ad cannot sit in the app forever. Each
person can also dismiss it, and a dismissed card stays gone until you post a
new one.

**How it works.** A scheduled GitHub Action reads the channel's public page
(`t.me/s/mukhtorov_md` — the same one anyone can open, no bot token involved),
finds the newest tagged post, and rebuilds the site with it. Nothing needs a
server, and the whole thing costs nothing: Actions minutes are free on public
repositories.

**Three things worth knowing:**

- It is not instant. With the outside timer set up (see
  [the outside timer](#the-outside-timer)), a new post
  shows within a few minutes. Without it, it waits for GitHub's own
  timer, which on this repository has run only every 2–7 hours. To publish
  immediately either way, open the repository's **Actions** tab, pick
  **Deploy to GitHub Pages**, and press **Run workflow**.
- If Telegram's page fails to load on a check, the card already live stays
  up — a hiccup never takes it down.
- Only public channels can be read this way, and only the recent posts on the
  channel page are considered.

To follow a different tag or change the 10-day window, edit `TAG` and
`MAX_AGE_DAYS` at the top of `tools/fetch-announcement.mjs`.

## The rating

The ☰ menu's **Rating** screen ranks every player on points out of 1000,
made from their day streak (50%), XP (30%) and average time on correct
answers (20%). Points are the only rank; day streak, XP and time are filters
that show who leads each part. The top ten are shown by Telegram name and
@username; everyone sees their own place, like **#88 / 2,300**.

Nobody joins. The app sends its score to a small rating server whenever it
changes — on opening, after a round, after a Medical English session — and
the server ranks everyone. The algorithm is `src/lib/rating.js`, used by the
app and the server alike.

### The rating server

`worker/` is a [Cloudflare Worker](https://developers.cloudflare.com/workers/)
with a D1 database, on Cloudflare's free plan, live at
`https://usmleengo-rating.azizbekmuxtorlapt.workers.dev`. A static site
could not do this on its own: the app had nowhere to send a score, and
Telegram does not let an app message the bot for the user.

- **Who sent a score cannot be faked.** Each score arrives with Telegram's
  signed launch data, which the server checks against the bot token
  ([Telegram's method](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)).
  The numbers are self-reported: impossible ones are refused (a streak older
  than the app, more XP than the answers allow), but a determined person could
  invent a plausible score.
- **Names stay on the server** except for whoever is in a top ten. Raw
  Telegram ids are never stored — players are kept under a hash.
- **Someone opening the site in a browser** is shown where they would rank,
  but never stored.
- **Limits.** The whole field is read at most once a minute, which keeps
  within D1's free 5 million rows a day for a few thousand players.

**Set up once** (already done for this repository):

```
cd worker
npx wrangler login                                   # opens Cloudflare; click Allow
npx wrangler d1 create usmleengo-rating              # put the id it prints in wrangler.toml
npx wrangler d1 execute usmleengo-rating --remote --file=schema.sql
npx wrangler deploy                                  # prints the server's address
```

Then in the Cloudflare dashboard: **Workers & Pages → usmleengo-rating →
Settings → Variables and Secrets → + Add**, type **Secret**, name
`BOT_TOKEN`, value the bot's token from BotFather, **Deploy**. Without it
every score is refused with "the server has no BOT_TOKEN". Put the server's
address in `RATING_API` in `src/lib/ratingApi.js`.

**To change the server later:** edit `worker/`, run `npm test`, then
`cd worker && npx wrangler deploy`. The app's own code still deploys to
GitHub Pages on push, as always.

**To try it locally:** put `BOT_TOKEN=<any test value>` in `worker/.dev.vars`,
run `npx wrangler d1 execute usmleengo-rating --local --file=schema.sql` and
`npx wrangler dev` in `worker/`, and `VITE_RATING_API=http://localhost:8787`
in `.env.local` at the top level. Both files are git-ignored.

### The outside timer

The announcement card is published by a GitHub Action, and GitHub's own
scheduled runs cannot be relied on: asked for every 30 minutes, this
repository's ran 2–7 hours apart over a whole week (about 4 on average).
GitHub does not hold back a run that is *started* through its API the same
way, so a free outside timer starts the workflow every minute.

*a. A token that can only start this workflow.* Open
[new fine-grained token](https://github.com/settings/personal-access-tokens/new):

- Name: `usmleengo-timer`. Expiration: the longest offered — note the date,
  because the timer stops when the token expires.
- Repository access: **Only select repositories** → `azizbek-mux/usmleengo`.
- Permissions → Repository permissions → **Actions: Read and write**. Nothing
  else.
- Generate, and copy the token. GitHub shows it only once.

*b. The timer.* Make a free account at [cron-job.org](https://cron-job.org)
and create a cron job:

- URL: `https://api.github.com/repos/azizbek-mux/usmleengo/actions/workflows/deploy.yml/dispatches`
- Schedule: every minute. (Every 5 minutes also works, just more slowly.)
- Under the advanced settings — request method **POST**, these headers:

  ```
  Authorization: Bearer <the token from step a>
  Accept: application/vnd.github+json
  X-GitHub-Api-Version: 2022-11-28
  Content-Type: application/json
  User-Agent: usmleengo-timer
  ```

- Request body:

  ```json
  {"ref":"main","inputs":{"force":"false"}}
  ```

Save it and use its test run: a working setup answers **204**. Within a
minute a run appears on the repository's **Actions** tab.

`force: false` keeps this cheap: a routine check reads the channel,
compares it with what is live, and stops if nothing changed — about twenty
seconds, no deploy. It also deploys if the live site was built from an older
commit than the latest, so a push whose own run was cut short still goes
out. Runs never cancel one another. A push, or pressing **Run workflow** by
hand, always deploys.

- GitHub switches its *own* timer off after 60 days without a push; the
  outside timer is not affected.
- The token for the timer expires on the date chosen when it was made. When
  GitHub emails about it, make a new one and replace it in the cron job's
  `Authorization` header.

## Multiplayer

A live quiz among friends, the way Kahoot plays: **Multiplayer** on the home
screen → **Create a game** → choose the question type (tap, typed or mixed),
5–30 questions, 10–30 seconds each and the topics → **Share invite**. The
invite is a Telegram link (`…/study?startapp=g482193`) that opens the app
straight into the game; the six-digit code works too. Up to 50 players; the
creator plays as well and presses **Start**.

Everyone gets the same question at the same moment. When all have answered,
or time is up, each phone shows the right answer, how many chose what, its
own place and the top five; after the last question, a podium. **New round**
plays again with the same people and fresh questions.

- **Points:** a correct answer earns its XP (10 tapped, 15 typed) × 100 ×
  speed — twice that for an instant answer, falling to once at the last
  second (Kahoot's own curve). A wrong answer earns nothing.
- **Only a game.** Nothing in it touches the player's XP, streak, rating or
  question history. Questions are picked at random every time — anything in
  the chosen topics can come up — and nothing is kept once a game ends.
- **How:** each game is a Cloudflare Durable Object (`worker/src/room.js`)
  that every phone holds a WebSocket open to; the rules are plain data in
  `worker/src/game.js`, shared scoring in `src/lib/game.js`. The creator's
  app picks the questions; the server shuffles and grades them, so a phone
  never learns an answer before the reveal. Games left alone for half an hour
  are deleted.
- **Tests:** `npm test` plays whole games through the rules and the room.
  After deploying the Worker, `node tools/game-live.mjs` plays a real
  three-phone game against the live server.

## Where the questions came from

The bank was derived from the reference PDFs, the extracted `bank.json` and
the UWorld Anki deck in this folder. Source vignettes and cloze cards were
reduced to their underlying facts and rewritten as original one-line questions
— no source stems, options or explanations are reproduced in the app. A
500-character clinical vignette could not become a five-second tap in any case.

Cloze cards do not convert mechanically: many hide a word the rest of the
sentence gives away, and some blank half a word. Each fact was re-authored, and
the format chosen per fact — fill-the-gap where one short answer is worth
recalling cold, multiple choice where the answer is a phrase or where two
things are genuinely confusable.

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

- More questions — the bank ships with 6,317 across 100 subject files
- Per-subject progress rings on the home screen
- A daily reminder push via the bot (needs a tiny server or a free cron service)
- Leaderboard among friends (needs a backend, so no longer free)

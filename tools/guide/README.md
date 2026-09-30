# The user guide (PDF)

`usmleengo-guide-en.pdf` and `usmleengo-qollanma-uz.pdf`: a screenshot guide to
every part of the app, in English and in Uzbek, made from the running app so it
can be made again when the app changes. Nothing here is part of the app.

The words and which part of which screen each note points at are in
`content.mjs`; edit that, not the PDF. When a screen changes, capture again.

## Make it again

Needs Node, Python with Pillow, Google Chrome, and puppeteer-core (installed
without touching package.json). From the repository root, with the dev server
running (`npm run dev`, port 5188):

```powershell
npm.cmd i --no-save puppeteer-core
cd tools\guide
node demo-state.mjs        # a lived-in demo profile, from the real bank
node snap-game.mjs         # real game states, played through worker/src/game.js
node cap.mjs en            # every screen, in English  (about 5 minutes)
node cap.mjs uz            # and in Uzbek
python prep-images.py      # the screenshots as smaller JPEGs
node build.mjs en          # usmleengo-guide-en.pdf
node build.mjs uz          # usmleengo-qollanma-uz.pdf
```

`node cap.mjs en home,quiz` captures only the named screens. `CHROME` and
`APP_URL` override the Chrome path and the dev server address.

## How it works

- `lib.mjs` opens the app in headless Chrome as a phone (390x844, 3x), with a
  fresh browser profile per screen so no page inherits another's progress.
- `mocks.mjs` stands in for the network: a made-up rating board and class, and
  a game whose states come from the server's own rules (`snap-game.mjs`).
  Nobody real appears in the pictures.
- `cap.mjs` drives the app to each screen, takes the screenshot, and records
  where the parts that the guide points at are on screen (`meta.json`).
- `build.mjs` lays the pages out as HTML (A4, Onest and Bricolage Grotesque
  from Google Fonts), draws the highlights and arrows from the recorded
  positions, and prints to PDF with Chrome.

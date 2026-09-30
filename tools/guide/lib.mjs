import puppeteer from "puppeteer-core";
export const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const BASE = process.env.APP_URL || "http://localhost:5188/";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] });
}

/** A phone-shaped page on the running dev server, with progress in localStorage. */
export async function phone(browser, { state = {}, init = "", w = 390, h = 844, scale = 3, delayBank = 0, url = BASE } = {}) {
  const ctx = await browser.createBrowserContext();   // its own storage: no page inherits another's progress
  const page = await ctx.newPage();
  const closePage = page.close.bind(page);
  page.close = async () => { await closePage().catch(() => {}); await ctx.close().catch(() => {}); };
  await page.setViewport({ width: w, height: h, deviceScaleFactor: scale, isMobile: true, hasTouch: true });
  await page.setUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36");
  await page.evaluateOnNewDocument((state, init) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      if (!localStorage.getItem("usmle_drops_v1") && state) localStorage.setItem("usmle_drops_v1", JSON.stringify({ theme: "dark", lang: "en", introSeen: true, lastDay: today, ...state }));
    } catch {}
    if (init) (0, eval)(init);
  }, state, init);
  if (delayBank) {
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      if (/questions(\.uz)?\.json/.test(req.url())) { await sleep(delayBank); }
      req.continue();
    });
  }
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page;
}
export const clickText = (page, re, sel = "button") => page.evaluate((src, flags, sel) => {
  const r = new RegExp(src, flags);
  const el = [...document.querySelectorAll(sel)].find((b) => r.test(b.textContent.trim()));
  if (el) el.click();
  return !!el;
}, re.source, re.flags, sel);

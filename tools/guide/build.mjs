// Builds the guide as one HTML file and prints it to PDF with headless Chrome.
//   node build.mjs <en|uz>
// The screenshots come from cap.mjs (shots/<lang>/*.png plus meta.json with the
// position of each part a note points at); the words from content.mjs.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { pages, rules, faq, BOT } from "./content.mjs";

const lang = process.argv[2] === "uz" ? "uz" : "en";
const T = (o) => (o && typeof o === "object" ? o[lang] : o);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const meta = JSON.parse(fs.readFileSync(`shots/${lang}/meta.json`, "utf8"));
const img = (name) => `img/${lang}/${name}.jpg`;

const C = { ink: "#0f1115", mint: "#46d19e", green: "#137a58", paper: "#fbfcfb", muted: "#566070", line: "#dfe6e3", tint: "#e7f6ee", arrow: "#e5541a" };
const PW = 210 * 96 / 25.4;               // page width in px, 793.7
const CW = 726;                            // content width inside the page

/* ── the logo, drawn as in the app ─────────────────────────────────────── */
const logo = ({ ring, ink, bg, size }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 272 272" width="${size}" height="${size}">
  <circle cx="130" cy="130" r="92" fill="none" stroke="${ring}" stroke-width="7"/>
  <text x="261.6" y="131" text-anchor="end" dominant-baseline="central" font-family="Segoe UI, Roboto, sans-serif" font-size="52" font-weight="800" letter-spacing="-1.5" stroke="${bg}" stroke-width="16" paint-order="stroke" fill="${ink}">usmleengo</text>
  <g transform="translate(246.8 127.2) scale(0.97)">
    <path d="M-16 0 C-16.8 -7.4 -13.2 -14.8 -6.6 -16.8 Q0 -18.6 6.6 -16.8 C13.2 -14.8 16.8 -7.4 16 0 Z" fill="${ink}" stroke="${bg}" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke"/>
    <path d="M-15 -3.9 H15" stroke="${bg}" stroke-width="1.5" stroke-linecap="round"/>
    <path transform="translate(0 -6.8) scale(1.35 1.5)" d="M0 -6.4 C4 -3.6 4.2 -0.4 0 1 C-4.2 -0.4 -4 -3.6 0 -6.4 Z" fill="${bg}"/>
  </g></svg>`;

// The embroidered almond (bodom) of a doppi, repeated as a band.
const bodom = (w, h, color, opacity) => {
  const cell = 34, rows = Math.ceil(h / (cell * 0.62)), cols = Math.ceil(w / cell) + 1;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block"><g fill="${color}" fill-opacity="${opacity}">`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = c * cell + (r % 2 ? cell / 2 : 0), y = r * cell * 0.62 + 12;
    s += `<path transform="translate(${x} ${y}) rotate(${r % 2 ? 14 : -14}) scale(1.05 1.2)" d="M0 -9 C6 -5 6.3 -0.6 0 1.5 C-6.3 -0.6 -6 -5 0 -9 Z"/>`;
  }
  return s + "</g></svg>";
};

/* ── shared pieces ─────────────────────────────────────────────────────── */
let pageNo = 0;
const badge = (n, cls = "") => `<span class="bd ${cls}">${n}</span>`;

function frame(inner, { section, dark = false } = {}) {
  pageNo++;
  const n = pageNo;
  return `<section class="page${dark ? " dark" : ""}">
  ${dark ? "" : `<header class="ph">${logo({ ring: C.green, ink: C.green, bg: C.paper, size: 40 })}<span class="sec">${esc(T(section) || "")}</span></header>`}
  ${inner}
  ${dark ? "" : `<footer class="pf"><span>usmleengo · ${lang === "uz" ? "qo'llanma" : "guide"} · ${BOT}</span><span>${n}</span></footer>`}
</section>`;
}

const title = (t, intro) => `<h1>${esc(T(t))}</h1>${intro ? `<p class="intro">${esc(T(intro))}</p>` : ""}`;
const tip = (t) => (t ? `<div class="tip"><span class="tag">${lang === "uz" ? "Maslahat" : "Tip"}</span><span>${esc(T(t))}</span></div>` : "");

const phoneBox = (name, x, y, w) => {
  const r = Math.round(38 * w / 390);
  return `<div class="phone" style="left:${x}px;top:${y}px;width:${w}px;border-radius:${r}px"><img src="${img(name)}" alt=""></div>`;
};
// A mark's box in figure coordinates.
const target = (shot, m, px, py, w, above) => {
  const names = Array.isArray(m) ? m : [m];
  const rs = names.map((n) => {
    const r = meta[shot]?.marks?.[n];
    if (!r) throw new Error(`no mark ${n} in ${shot}`);
    return r;
  });
  // one box around all of them, kept inside the screenshot
  const x0 = Math.max(0, Math.min(...rs.map((r) => r.x))), y0 = Math.max(0, Math.min(...rs.map((r) => r.y)));
  const cut = above ? meta[shot].marks[above].y - 6 : 844;
  const x1 = Math.min(390, Math.max(...rs.map((r) => r.x + r.w))), y1 = Math.min(cut, 844, Math.max(...rs.map((r) => r.y + r.h)));
  const k = w / 390;
  return { x: px + x0 * k, y: py + y0 * k, w: (x1 - x0) * k, h: (y1 - y0) * k };
};

/* ── page kinds ────────────────────────────────────────────────────────── */

// A: one big phone, the notes in the columns beside it.
function pageA(p) {
  const w = p.width || 330, h = Math.round(w * 844 / 390);
  const x0 = (CW - w) / 2, y0 = 8;
  const gap = 30, colW = x0 - gap;
  const notes = p.notes.map((n, i) => ({ ...n, i: i + 1, box: target(p.shot, n.m, x0, y0, w, n.above) }));
  // numbering follows reading order: top to bottom
  const byY = [...notes].sort((a, b) => (a.y ?? a.box.y + a.box.h / 2) - (b.y ?? b.box.y + b.box.h / 2));
  byY.forEach((n, i) => { n.i = i + 1; });
  const cos = notes.map((n) => `<div class="co ${n.side}" data-i="${n.i}" data-side="${n.side}" data-y="${n.y ?? ""}" data-entry="${n.entry || ""}" data-tx="${n.box.x}" data-ty="${n.box.y}" data-tw="${n.box.w}" data-th="${n.box.h}"
      style="width:${colW}px;${n.side === "L" ? "left:0" : `left:${x0 + w + gap}px`}">${badge(n.i)}<div class="tx"><b>${esc(T(n.t))}</b><span>${esc(T(n.d))}</span></div></div>`).join("");
  return frame(`${title(p.title, p.intro)}
    <div class="fig" data-kind="A" style="width:${CW}px;height:${h + y0 + 12}px">${phoneBox(p.shot, x0, y0, w)}${cos}<svg class="arrows" width="${CW}" height="${h + y0 + 12}"></svg></div>
    ${tip(p.tip)}`, { section: p.section });
}

// B: two phones, a numbered arrow at each spot, the notes underneath.
function pageB(p) {
  const w = 264, h = Math.round(w * 844 / 390), gap = 100;
  const total = 2 * w + gap, xs = [(CW - total) / 2, (CW - total) / 2 + w + gap], y0 = 30;
  let n = 0;
  const parts = [], legend = [[], []];
  p.phones.forEach((ph, pi) => {
    parts.push(phoneBox(ph.shot, xs[pi], y0, w));
    parts.push(`<div class="cap" style="left:${xs[pi]}px;top:0;width:${w}px">${esc(T(ph.cap))}</div>`);
    ph.items.forEach((it) => {
      n++;
      const box = target(ph.shot, it.m, xs[pi], y0, w, it.above);
      const bx = it.side === "L" ? xs[pi] - 34 : xs[pi] + w + 34;
      const cy = Math.min(Math.max(box.y + box.h / 2, y0 + 16), y0 + h - 16);
      parts.push(`<div class="hl" data-tx="${box.x}" data-ty="${box.y}" data-tw="${box.w}" data-th="${box.h}" data-bx="${bx}" data-by="${cy}" data-side="${it.side}"></div>`);
      parts.push(`<span class="bd big" style="left:${bx - 12}px;top:${cy - 12}px">${n}</span>`);
      legend[pi].push(`<div class="lg">${badge(n)}<div class="tx"><b>${esc(T(it.t))}</b><span>${esc(T(it.d))}</span></div></div>`);
    });
  });
  return frame(`${title(p.title, p.intro)}
    <div class="fig" data-kind="B" style="width:${CW}px;height:${h + y0 + 8}px">${parts.join("")}<svg class="arrows" width="${CW}" height="${h + y0 + 8}"></svg></div>
    <div class="legend"><div>${legend[0].join("")}</div><div>${legend[1].join("")}</div></div>
    ${tip(p.tip)}`, { section: p.section });
}

/* ── the cover, the steps page, the reference pages, the closing page ─── */
function cover() {
  pageNo++;
  const big = lang === "uz"
    ? `<span class="mint">usmleengo</span><br>qo'llanmasi`
    : `How to use<br><span class="mint">usmleengo</span>`;
  const sub = lang === "uz" ? "To'liq yo'riqnoma" : "The complete guide";
  const line = lang === "uz"
    ? "6 600+ USMLE savoli, Tibbiy ingliz tili kartochkalari, jonli o'yinlar, guruhlar va reyting — hammasi Telegram ichida."
    : "6,600+ USMLE quizzes, Medical English flashcards, live games, classes and a rating — all inside Telegram.";
  return `<section class="page dark cover">
    <svg class="ringbg" viewBox="0 0 600 600" width="640" height="640"><circle cx="300" cy="300" r="270" fill="none" stroke="${C.mint}" stroke-opacity=".22" stroke-width="10"/></svg>
    <div class="cv-logo">${logo({ ring: C.mint, ink: C.mint, bg: C.ink, size: 132 })}</div>
    <h1 class="cv-t">${big}</h1>
    <div class="cv-s">${sub}</div>
    <p class="cv-p">${esc(line)}</p>
    <div class="cv-phone" style="width:300px;border-radius:40px"><img src="${img("home")}" alt=""></div>
    <div class="cv-band">${bodom(800, 190, C.mint, 0.2)}</div>
    <div class="cv-foot"><b>${BOT}</b><span>Telegram Mini App</span></div>
  </section>`;
}

function steps(p) {
  const ph = (inner, w) => `<div class="phone tgp" style="width:${w}px;border-radius:30px;position:relative">${inner}</div>`;
  const av = `<span class="av">${logo({ ring: C.mint, ink: C.mint, bg: C.ink, size: 30 })}</span>`;
  const chat = p.chat;
  // (a) a new chat with the Start button, (b) after Start
  const a = ph(`<div class="tg"><div class="tg-head">${av}<div><b>usmleengo</b><small>bot</small></div></div>
      <div class="tg-body"><div class="tg-empty">${esc(lang === "uz" ? "Bot haqida" : "What can this bot do?")}</div></div>
      <div class="tg-start" id="hl-start">START</div></div>`, 216);
  const b = ph(`<div class="tg"><div class="tg-head">${av}<div><b>usmleengo</b><small>bot</small></div></div>
      <div class="tg-body"><div class="bubble">${esc(T(chat.welcome)).replace(/\n/g, "<br>")}</div><div class="ibtn" id="hl-open">${esc(T(chat.open))}</div></div>
      <div class="tg-bar"><span class="menu" id="hl-menu">${esc(T(chat.menu))}</span><span class="inp">${lang === "uz" ? "Xabar" : "Message"}</span></div></div>`, 216);
  const list = p.steps.map(([t, d], i) => `<li>${badge(i + 1, "big")}<div><b>${esc(T(t))}</b><span>${esc(T(d))}</span></div></li>`).join("");
  const facts = p.facts.map((f) => `<li>${esc(T(f))}</li>`).join("");
  return frame(`${title(p.title, p.intro)}
    <div class="steps">
      <div class="tgs" data-kind="steps">${a}${b}<div class="ill">${esc(T(chat.draw))}</div>
        <svg class="arrows" width="470" height="470"></svg></div>
      <div class="sl"><ol>${list}</ol>
        <div class="facts"><h3>${lang === "uz" ? "Bilib qo'ying" : "Good to know"}</h3><ul>${facts}</ul></div></div>
    </div>`, { section: p.section });
}

function reference() {
  const block = (b) => `<div class="rb"><h3>${esc(T(b.head))}</h3>${b.rows ? `<table>${b.rows.map(([k, v]) => `<tr><th>${esc(T(k))}</th><td>${esc(T(v))}</td></tr>`).join("")}</table>` : `<p>${esc(T(b.text))}</p>`}</div>`;
  return frame(`${title(rules.title)}<div class="ref">${block(rules.rating)}${block(rules.game)}${block(rules.streak)}</div>`, { section: rules.section });
}

function faqPage() {
  const items = faq.items.map(([q, a]) => `<div class="qa"><b>${esc(T(q))}</b><p>${esc(T(a))}</p></div>`).join("");
  return frame(`${title(faq.title)}<div class="faq">${items}</div>`, { section: faq.section });
}

function closing() {
  pageNo++;
  const words = lang === "uz"
    ? ["Har kuni ozgina.", "Bir kunlik intizom — bir savoldan boshlanadi."]
    : ["A little, every day.", "A streak starts with a single question."];
  return `<section class="page dark closing">
    <div class="cl-band top">${bodom(800, 120, C.mint, 0.2)}</div>
    <div class="cl-logo">${logo({ ring: C.mint, ink: C.mint, bg: C.ink, size: 210 })}</div>
    <h2>${words[0]}</h2><p>${words[1]}</p>
    <div class="cl-bot">${BOT}</div>
    <div class="cl-by">designed by mukhtorov</div>
    <div class="cl-band">${bodom(800, 150, C.mint, 0.2)}</div>
  </section>`;
}

const html = [];
for (const p of pages) {
  if (p.kind === "cover") html.push(cover());
  else if (p.kind === "steps") html.push(steps(p));
  else if (p.kind === "A") html.push(pageA(p));
  else if (p.kind === "B") html.push(pageB(p));
  else if (p.kind === "reference") html.push(reference());
  else if (p.kind === "faq") html.push(faqPage());
  else if (p.kind === "closing") html.push(closing());
}

/* ── the style ─────────────────────────────────────────────────────────── */
const css = `
@page { size: 210mm 297mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: 'Onest', 'Segoe UI', sans-serif; color: ${C.ink}; background: #fff; }
.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; background: ${C.paper}; page-break-after: always; break-after: page; padding: 78px 34px 0; }
.page.dark { background: ${C.ink}; color: #fff; padding: 0; }
.ph { position: absolute; left: 34px; right: 34px; top: 22px; height: 44px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid ${C.line}; }
.ph .sec { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: ${C.muted}; font-weight: 600; }
.pf { position: absolute; left: 34px; right: 34px; bottom: 20px; display: flex; justify-content: space-between; font-size: 9.5px; color: #8a94a3; letter-spacing: .3px; border-top: 1px solid ${C.line}; padding-top: 8px; }
h1 { font-family: 'Bricolage Grotesque', 'Onest', sans-serif; font-weight: 800; font-size: 31px; line-height: 1.08; letter-spacing: -0.4px; text-wrap: balance; }
.intro { margin-top: 8px; font-size: 13.2px; line-height: 1.5; color: #39424f; max-width: 610px; }
.fig { position: relative; margin-top: 12px; }
.phone { position: absolute; overflow: hidden; background: #0f1115; box-shadow: 0 0 0 5px #171b22, 0 16px 34px rgba(15,17,21,.30); }
.phone img { display: block; width: 100%; }
.arrows { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
.bd { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${C.arrow}; color: #fff; font: 700 11px 'Onest', sans-serif; line-height: 1; }
.bd.big { width: 24px; height: 24px; font-size: 12.5px; }
.fig .bd.big { position: absolute; box-shadow: 0 0 0 3px ${C.paper}; }
.co { position: absolute; display: flex; gap: 8px; align-items: flex-start; }
.co.L { flex-direction: row-reverse; text-align: right; }
.co .tx, .lg .tx { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.co b, .lg b { font-size: 11.6px; font-weight: 700; line-height: 1.25; }
.co span, .lg span { font-size: 10.2px; line-height: 1.42; color: ${C.muted}; }
.cap { position: absolute; text-align: center; font-size: 10.5px; letter-spacing: 1.2px; text-transform: uppercase; font-weight: 700; color: ${C.green}; }
.legend { margin-top: 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
.legend > div { display: flex; flex-direction: column; gap: 9px; }
.lg { display: flex; gap: 9px; align-items: flex-start; }
.tip { position: absolute; left: 34px; right: 34px; bottom: 50px; display: flex; gap: 12px; align-items: center; background: ${C.tint}; border: 1px solid #b7e5cf; border-radius: 12px; padding: 10px 14px; font-size: 11.6px; line-height: 1.45; color: #17402f; }
.tip .tag { flex: none; font-size: 9.5px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 800; color: #fff; background: ${C.green}; border-radius: 6px; padding: 4px 7px; }
/* steps */
.steps { display: grid; grid-template-columns: 470px 1fr; gap: 26px; margin-top: 26px; }
.tgs { position: relative; height: 470px; display: flex; gap: 30px; align-items: flex-start; padding-top: 6px; }
.tgp { box-shadow: 0 0 0 5px #171b22, 0 14px 30px rgba(15,17,21,.28); background: #0e1621; height: 440px; overflow: hidden; }
.tg { height: 440px; display: flex; flex-direction: column; color: #e8edf3; font-size: 11px; }
.tg-head { display: flex; gap: 8px; align-items: center; padding: 10px 12px; background: #17212b; border-bottom: 1px solid #0b121a; }
.tg-head b { display: block; font-size: 12.5px; } .tg-head small { color: #7d8b99; font-size: 10px; }
.av { width: 32px; height: 32px; border-radius: 50%; background: ${C.ink}; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.tg-body { flex: 1; padding: 12px; display: flex; flex-direction: column; gap: 6px; background: #0e1621; }
.tg-empty { margin: auto; background: #182533; border-radius: 12px; padding: 8px 12px; color: #a9b6c3; font-size: 11px; }
.bubble { background: #182533; border-radius: 12px 12px 12px 3px; padding: 9px 11px; font-size: 11px; line-height: 1.4; max-width: 190px; }
.ibtn { background: #1f3346; border-radius: 8px; padding: 8px; text-align: center; font-weight: 600; color: #7fc4ff; max-width: 190px; }
.tg-start { background: #2b5278; text-align: center; padding: 13px; font-weight: 700; letter-spacing: 1px; color: #fff; margin: 0; }
.tg-bar { display: flex; gap: 8px; padding: 8px 10px; background: #17212b; align-items: center; }
.tg-bar .menu { background: #2b5278; border-radius: 14px; padding: 6px 10px; font-weight: 700; font-size: 10.5px; color: #fff; }
.tg-bar .inp { flex: 1; background: #0e1621; border-radius: 14px; padding: 6px 10px; color: #5f6f7e; }
.ill { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font-size: 9.5px; color: #8a94a3; letter-spacing: .4px; }
.sl ol { list-style: none; display: flex; flex-direction: column; gap: 15px; margin-top: 6px; }
.sl li { display: flex; gap: 11px; align-items: flex-start; }
.sl li b { display: block; font-size: 13.5px; margin-bottom: 2px; }
.sl li span { display: block; font-size: 11.3px; line-height: 1.45; color: ${C.muted}; }
.facts { margin-top: 24px; background: #fff; border: 1px solid ${C.line}; border-radius: 12px; padding: 12px 14px; }
.facts h3 { font-size: 10px; letter-spacing: 1.4px; text-transform: uppercase; color: ${C.green}; margin-bottom: 6px; }
.facts li { font-size: 11px; line-height: 1.45; margin: 4px 0 4px 15px; color: #39424f; }
/* reference and faq */
.ref { margin-top: 22px; display: flex; flex-direction: column; gap: 20px; }
.rb { background: #fff; border: 1px solid ${C.line}; border-radius: 14px; padding: 18px 22px; }
.rb h3 { font-family: 'Bricolage Grotesque', 'Onest', sans-serif; font-size: 19px; margin-bottom: 10px; }
.rb table { border-collapse: collapse; width: 100%; }
.rb th { text-align: left; font-weight: 700; font-size: 12.8px; width: 190px; padding: 10px 12px 10px 0; vertical-align: top; border-top: 1px solid ${C.line}; }
.rb td { font-size: 12.8px; line-height: 1.5; color: #39424f; padding: 10px 0; border-top: 1px solid ${C.line}; }
.rb tr:first-child th, .rb tr:first-child td { border-top: none; }
.rb p { font-size: 12.8px; line-height: 1.55; color: #39424f; }
.faq { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 26px 32px; }
.qa b { display: block; font-size: 14px; line-height: 1.3; margin-bottom: 5px; }
.qa p { font-size: 12.4px; line-height: 1.55; color: #39424f; }
/* cover and closing */
.cover .ringbg { position: absolute; right: -150px; bottom: 60px; }
.cv-logo { position: absolute; left: 52px; top: 52px; }
.cv-t { position: absolute; left: 52px; top: 250px; font-size: 76px; line-height: 1.0; letter-spacing: -2px; color: #fff; }
.cv-t .mint { color: ${C.mint}; }
.cv-s { position: absolute; left: 54px; top: 460px; font-family: 'Bricolage Grotesque', sans-serif; font-size: 25px; font-weight: 600; color: #b7c1cd; }
.cv-p { position: absolute; left: 54px; top: 512px; width: 300px; font-size: 14.5px; line-height: 1.55; color: #97a3b1; }
.cv-phone { position: absolute; right: 44px; top: 610px; overflow: hidden; box-shadow: 0 0 0 6px #232833, 0 30px 60px rgba(0,0,0,.5); background: #0f1115; }
.cv-phone img { display: block; width: 100%; }
.cv-band { position: absolute; left: 0; bottom: 0; }
.cv-foot { position: absolute; left: 54px; bottom: 62px; display: flex; flex-direction: column; gap: 3px; }
.cv-foot b { font-size: 19px; color: ${C.mint}; } .cv-foot span { font-size: 12px; color: #97a3b1; letter-spacing: 1px; text-transform: uppercase; }
.closing { text-align: center; }
.cl-band { position: absolute; left: 0; bottom: 0; } .cl-band.top { top: 0; bottom: auto; transform: scaleY(-1); }
.cl-logo { position: absolute; left: 0; right: 0; top: 300px; display: flex; justify-content: center; }
.closing h2 { position: absolute; left: 0; right: 0; top: 560px; font-family: 'Bricolage Grotesque', sans-serif; font-size: 40px; font-weight: 800; }
.closing p { position: absolute; left: 0; right: 0; top: 622px; font-size: 16px; color: #97a3b1; }
.cl-bot { position: absolute; left: 0; right: 0; top: 700px; font-size: 22px; font-weight: 700; color: ${C.mint}; }
.cl-by { position: absolute; left: 0; right: 0; top: 740px; font-size: 12px; color: #6d7887; letter-spacing: .6px; }
`;

const doc = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>usmleengo ${lang === "uz" ? "qo'llanmasi" : "guide"}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&display=swap">
<style>${css}</style></head><body>${html.join("\n")}
<script>
// Place the notes so they do not overlap, then draw the highlights and arrows.
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const arrow = (svg, x0, y0, x1, y1) => {
    const dx = (x1 - x0) * 0.5;
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", "M" + x0 + "," + y0 + " C" + (x0 + dx) + "," + y0 + " " + (x1 - dx) + "," + y1 + " " + x1 + "," + y1);
    p.setAttribute("fill", "none"); p.setAttribute("stroke", "${C.arrow}"); p.setAttribute("stroke-width", "2.2"); p.setAttribute("stroke-linecap", "round");
    svg.appendChild(p);
    const s = x1 >= x0 ? 1 : -1, h = document.createElementNS(NS, "path");
    h.setAttribute("d", "M" + x1 + "," + y1 + " l" + (-9 * s) + ",-5.5 l0,11 z"); h.setAttribute("fill", "${C.arrow}");
    svg.appendChild(h);
  };
  const arrowDown = (svg, x0, y0, x1, y1) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", "M" + x0 + "," + y0 + " C" + (x0 + (x1 - x0) * 0.6) + "," + y0 + " " + x1 + "," + (y1 - Math.max(30, (y1 - y0) * 0.5)) + " " + x1 + "," + y1);
    p.setAttribute("fill", "none"); p.setAttribute("stroke", "${C.arrow}"); p.setAttribute("stroke-width", "2.2"); p.setAttribute("stroke-linecap", "round");
    svg.appendChild(p);
    const h = document.createElementNS(NS, "path");
    h.setAttribute("d", "M" + x1 + "," + y1 + " l-5.5,-9 l11,0 z"); h.setAttribute("fill", "${C.arrow}");
    svg.appendChild(h);
  };
  const box = (svg, x, y, w, h) => {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", x - 4); r.setAttribute("y", y - 4); r.setAttribute("width", w + 8); r.setAttribute("height", h + 8); r.setAttribute("rx", 9);
    r.setAttribute("fill", "rgba(229,84,26,.10)"); r.setAttribute("stroke", "${C.arrow}"); r.setAttribute("stroke-width", "2.4");
    svg.appendChild(r);
  };
  function run() {
    document.querySelectorAll('.fig[data-kind="A"]').forEach((fig) => {
      const svg = fig.querySelector(".arrows"), figH = fig.offsetHeight;
      for (const side of ["L", "R"]) {
        const cos = [...fig.querySelectorAll(".co." + side)];
        cos.forEach((c) => { c._want = c.dataset.y !== "" ? +c.dataset.y : (+c.dataset.ty + +c.dataset.th / 2); });
        cos.sort((a, b) => a._want - b._want);
        let top = -1e9;
        cos.forEach((c) => { const h = c.offsetHeight; let t = Math.max(c._want - 10, top + 12); c._t = t; top = t + h; });
        let bottom = figH; // push up whatever runs off the bottom
        for (let i = cos.length - 1; i >= 0; i--) { const c = cos[i], h = c.offsetHeight; if (c._t + h > bottom) c._t = bottom - h; bottom = c._t - 12; }
        cos.forEach((c) => { c.style.top = Math.max(0, c._t) + "px"; });
      }
      fig.querySelectorAll(".co").forEach((c) => {
        const bd = c.querySelector(".bd").getBoundingClientRect(), fr = fig.getBoundingClientRect();
        const ty = +c.dataset.ty, th = +c.dataset.th, tx = +c.dataset.tx, tw = +c.dataset.tw, L = c.dataset.side === "L";
        const y0 = bd.top - fr.top + bd.height / 2, x0 = L ? bd.right - fr.left + 4 : bd.left - fr.left - 4;
        const y1 = Math.min(Math.max(y0, ty + 6), ty + th - 6), x1 = L ? tx - 5 : tx + tw + 5;
        box(svg, tx, ty, tw, th);
        if (c.dataset.entry === "top") arrowDown(svg, x0, y0, tx + tw / 2, ty - 5); else arrow(svg, x0, y0, x1, y1);
      });
    });
    document.querySelectorAll('.fig[data-kind="B"]').forEach((fig) => {
      const svg = fig.querySelector(".arrows");
      fig.querySelectorAll(".hl").forEach((h) => {
        const tx = +h.dataset.tx, ty = +h.dataset.ty, tw = +h.dataset.tw, th = +h.dataset.th, bx = +h.dataset.bx, by = +h.dataset.by, L = h.dataset.side === "L";
        box(svg, tx, ty, tw, th);
        const y1 = Math.min(Math.max(by, ty + 6), ty + th - 6);
        arrow(svg, L ? bx + 13 : bx - 13, by, L ? tx - 5 : tx + tw + 5, y1);
      });
    });
    // the Telegram illustration
    const st = document.querySelector('.tgs[data-kind="steps"]');
    if (st) {
      const svg = st.querySelector(".arrows"), fr = st.getBoundingClientRect();
      const mark = (id, n, side) => {
        const el = document.getElementById(id); if (!el) return;
        const r = el.getBoundingClientRect(), x = r.left - fr.left, y = r.top - fr.top;
        box(svg, x, y, r.width, r.height);
        const b = document.createElement("span"); b.className = "bd big"; b.textContent = n;
        b.style.cssText = "position:absolute;left:" + (side === "L" ? x - 40 : x + r.width + 18) + "px;top:" + (y + r.height / 2 - 12) + "px;box-shadow:0 0 0 3px ${C.paper}";
        st.appendChild(b);
        const bx = side === "L" ? x - 16 : x + r.width + 18 + 12;
        arrow(svg, side === "L" ? x - 16 : x + r.width + 18, y + r.height / 2, side === "L" ? x - 5 : x + r.width + 5, y + r.height / 2);
      };
      mark("hl-start", 2, "L"); mark("hl-open", 3, "R"); mark("hl-menu", 3, "L");
    }
    document.body.dataset.ready = "1";
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(run, 400));
})();
</script></body></html>`;

fs.writeFileSync(`guide-${lang}.html`, doc);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 794, height: 1123 });
await page.goto(pathToFileURL(path.resolve(`guide-${lang}.html`)).href, { waitUntil: "networkidle0", timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.ready === "1", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 500));
const out = `usmleengo-${lang === "uz" ? "qollanma-uz" : "guide-en"}.pdf`;
await page.pdf({ path: out, width: "210mm", height: "297mm", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log("wrote", out, fs.statSync(out).size, "bytes,", pageNo, "pages");

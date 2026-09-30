// Opening a teacher's question file on the phone: Word (.docx), PDF, a web
// page (.html) or plain text. Each comes out as blocks — { text } and
// { image } in document order — for parseQuestions in qformat.js.
//
// All of it runs here, on the phone. The free server has about ten
// milliseconds of computing per request, far too little to read a
// thirty-page document; the phone has no such limit.

export class FileError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

import { t } from "./i18n.js";

export const ACCEPTED = ".docx,.pdf,.html,.htm,.txt";

function kindOf(name, type) {
  const ext = String(name || "").toLowerCase().split(".").pop();
  if (ext === "docx") return "docx";
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "html" || ext === "htm" || type === "text/html") return "html";
  if (ext === "txt" || type === "text/plain") return "txt";
  if (ext === "doc") return "doc";
  return null;
}

/** A file's blocks, or a FileError saying why it cannot be read. */
export async function readQuestionFile(file) {
  const kind = kindOf(file.name, file.type);
  if (kind === "doc") throw new FileError("old-word");
  if (!kind) throw new FileError("unknown-type");
  if (kind === "txt") return [{ text: await file.text() }];
  if (kind === "html") return readHtml(await file.text());
  if (kind === "docx") return readDocx(await file.arrayBuffer());
  return readPdf(await file.arrayBuffer());
}

/* ── Word ─────────────────────────────────────────────────────────────── */

/**
 * The files inside a zip, read with the browser's own inflater. A .docx is
 * a zip of XML files and pictures; no library is needed to open one.
 */
async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new FileError("broken");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = new Map();
  const decoder = new TextDecoder();
  for (let n = 0; n < count && view.getUint32(at, true) === 0x02014b50; n++) {
    const nameLength = view.getUint16(at + 28, true);
    entries.set(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)), {
      method: view.getUint16(at + 10, true),
      size: view.getUint32(at + 20, true),
      local: view.getUint32(at + 42, true),
    });
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return {
    has: (name) => entries.has(name),
    async read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const start = e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
      const data = bytes.subarray(start, start + e.size);
      if (e.method === 0) return data;
      if (e.method !== 8) throw new FileError("broken");
      if (typeof DecompressionStream !== "function") throw new FileError("old-phone");
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    },
  };
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const IMAGE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };

const xmlOf = (bytes) => new DOMParser().parseFromString(new TextDecoder().decode(bytes), "application/xml");
const attr = (el, name) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;

/**
 * How each of Word's numbered lists counts: numId → level → "decimal",
 * "upperLetter", "lowerLetter"… Word writes "1." and "A)" for its own
 * numbered lists without putting them in the text, so they have to be
 * written back in for the question format to see them.
 */
async function numberingOf(zip) {
  const formats = new Map();
  const bytes = await zip.read("word/numbering.xml");
  if (!bytes) return formats;
  const doc = xmlOf(bytes);
  const abstract = new Map();
  for (const a of doc.getElementsByTagNameNS(W, "abstractNum")) {
    const levels = new Map();
    for (const lvl of a.getElementsByTagNameNS(W, "lvl")) {
      const fmt = lvl.getElementsByTagNameNS(W, "numFmt")[0];
      levels.set(Number(attr(lvl, "ilvl")), attr(fmt, "val"));
    }
    abstract.set(attr(a, "abstractNumId"), levels);
  }
  for (const num of doc.getElementsByTagNameNS(W, "num")) {
    const ref = num.getElementsByTagNameNS(W, "abstractNumId")[0];
    formats.set(attr(num, "numId"), abstract.get(attr(ref, "val")) || new Map());
  }
  return formats;
}

async function readDocx(buffer) {
  const zip = await unzip(buffer);
  const main = await zip.read("word/document.xml");
  if (!main) throw new FileError("broken");
  const doc = xmlOf(main);
  const formats = await numberingOf(zip);

  const rels = new Map();
  const relBytes = await zip.read("word/_rels/document.xml.rels");
  if (relBytes) {
    for (const r of xmlOf(relBytes).getElementsByTagName("Relationship")) rels.set(r.getAttribute("Id"), r.getAttribute("Target"));
  }

  const counters = new Map(); // "numId:level" → count
  const blocks = [];
  for (const p of doc.getElementsByTagNameNS(W, "p")) {
    let prefix = "";
    const numPr = p.getElementsByTagNameNS(W, "numPr")[0];
    if (numPr) {
      const numId = attr(numPr.getElementsByTagNameNS(W, "numId")[0], "val");
      const level = Number(attr(numPr.getElementsByTagNameNS(W, "ilvl")[0], "val") || 0);
      const fmt = formats.get(numId)?.get(level);
      const key = `${numId}:${level}`;
      const n = (counters.get(key) || 0) + 1;
      counters.set(key, n);
      // A new item at one level starts the levels below it again.
      for (const k of counters.keys()) {
        const [id, l] = k.split(":");
        if (id === numId && Number(l) > level) counters.delete(k);
      }
      if (fmt === "decimal") prefix = `${n}. `;
      else if (fmt === "upperLetter") prefix = `${String.fromCharCode(64 + n)}) `;
      else if (fmt === "lowerLetter") prefix = `${String.fromCharCode(96 + n)}) `;
    }

    let text = prefix;
    const walker = doc.createTreeWalker(p, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.nextNode(); el; el = walker.nextNode()) {
      const name = el.localName;
      if (name === "t" && el.namespaceURI === W) text += el.textContent;
      else if (name === "tab") text += " ";
      else if (name === "br" || name === "cr") text += "\n";
      else if (name === "blip") {
        const target = rels.get(el.getAttributeNS(R, "embed") || el.getAttribute("r:embed"));
        if (!target) continue;
        const path = target.startsWith("/") ? target.slice(1) : `word/${target}`;
        const type = IMAGE_TYPES[path.split(".").pop().toLowerCase()];
        const data = type && (await zip.read(path));
        if (!data) continue; // a drawing Word keeps in a format the phone cannot show
        if (text.trim()) blocks.push({ text });
        text = "";
        blocks.push({ image: new Blob([data], { type }) });
      }
    }
    if (text.trim()) blocks.push({ text });
  }
  return blocks;
}

/* ── web pages ─────────────────────────────────────────────────────────── */

const BREAKS = new Set(["P", "DIV", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "BR", "TABLE", "UL", "OL", "SECTION", "ARTICLE", "BLOCKQUOTE"]);

async function readHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blocks = [];
  let text = "";
  const flush = () => { if (text.trim()) blocks.push({ text }); text = ""; };

  async function walk(node) {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { text += child.textContent; continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (tag === "SCRIPT" || tag === "STYLE") continue;
      if (tag === "IMG") {
        const src = child.getAttribute("src") || "";
        // Only pictures carried inside the file itself; a link to a picture
        // elsewhere may not be reachable from the phone.
        if (src.startsWith("data:image/")) {
          flush();
          try { blocks.push({ image: await (await fetch(src)).blob() }); } catch { /* unreadable */ }
        }
        continue;
      }
      if (BREAKS.has(tag)) text += "\n";
      if (tag === "LI" && child.parentElement?.tagName === "OL") {
        // A numbered list's numbers are not in its text.
        const index = [...child.parentElement.children].indexOf(child) + 1;
        const type = child.parentElement.getAttribute("type");
        text += type === "A" ? `${String.fromCharCode(64 + index)}) ` : type === "a" ? `${String.fromCharCode(96 + index)}) ` : `${index}. `;
      }
      await walk(child);
      if (BREAKS.has(tag)) text += "\n";
    }
  }
  await walk(doc.body || doc.documentElement);
  flush();
  return blocks;
}

/* ── PDF ──────────────────────────────────────────────────────────────── */

/**
 * The text of a PDF, line by line. pdf.js is loaded only now, the first
 * time someone opens a PDF, so the app itself stays as light as it was.
 * A scanned PDF is pictures of pages with no text in it; that is said, not
 * guessed at.
 */
async function readPdf(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  } catch {
    throw new FileError("broken");
  }
  const lines = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    // Items on the same line share a height on the page; group them by it,
    // top to bottom, left to right.
    const rows = new Map();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(item);
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) {
      lines.push(rows.get(y).sort((a, b) => a.transform[4] - b.transform[4]).map((i) => i.str).join(" "));
    }
  }
  if (!lines.join("").trim()) throw new FileError("scanned");
  return [{ text: lines.join("\n") }];
}

/** What went wrong, in words a teacher can act on. */
export const FILE_REASONS = () => ({
  "old-word": t("That’s an old Word file (.doc). In Word, choose Save As → Word Document (.docx), then try again.",
    "Bu eski Word fayli (.doc). Word'da «Saqlash sifatida» → «Word hujjati (.docx)» ni tanlang va qayta urinib ko'ring."),
  "unknown-type": t("Only Word (.docx), PDF, web pages (.html) and text (.txt) can be read.",
    "Faqat Word (.docx), PDF, veb-sahifa (.html) va matn (.txt) fayllarini o'qish mumkin."),
  broken: t("That file couldn’t be opened. It may be damaged — try saving it again.",
    "Faylni ochib bo'lmadi. U shikastlangan bo'lishi mumkin — qaytadan saqlab ko'ring."),
  scanned: t("This PDF is a scan, with no text in it to read. Use the Word file it came from, or type the questions.",
    "Bu PDF skanerlangan — unda o'qiladigan matn yo'q. Uning asl Word faylidan foydalaning yoki savollarni yozing."),
  "old-phone": t("This phone can’t unpack Word files here. Save it as PDF or text instead.",
    "Bu telefon Word fayllarini ocha olmaydi. Uni PDF yoki matn sifatida saqlang."),
});

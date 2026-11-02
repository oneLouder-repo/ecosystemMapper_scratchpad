/**
 * A small PDF writer: text documents from blocks (core/markdown.js), with
 * headings, paragraphs, lists, quotes, code, rules, tables and hanging-
 * indent references, on US Letter pages with page numbers. It uses the
 * PDF standard fonts (Helvetica, Courier), so files are small and need no
 * embedded fonts; characters outside Western European text print as "?".
 *
 *   pdf(blocks, dc) → Uint8Array
 *
 * The Dublin Core record goes in the file's Info dictionary and its XMP
 * metadata, which PDF readers show as the document's properties.
 */
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const HELV_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];
const FONTS = { R: 'Helvetica', B: 'Helvetica-Bold', I: 'Helvetica-Oblique', BI: 'Helvetica-BoldOblique', C: 'Courier' };
const KEYS = Object.keys(FONTS);

// Unicode → WinAnsi for the characters text actually uses.
const WIN = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f };
const SUBST = { '☐': '[ ]', '☑': '[x]', '◦': '-', '▪': '-', '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '×': 'x', ' ': ' ' };
const winChar = (ch) => {
  if (WIN[ch]) return String.fromCharCode(WIN[ch]);
  const c = ch.codePointAt(0);
  if (c < 256 && c >= 32) return ch;
  return SUBST[ch] ?? '?';
};
const toWin = (s) => [...String(s)].map(winChar).join('');
const escPdf = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function width(text, font, size) {
  if (font === 'C') return text.length * 600 * size / 1000;
  const table = font.includes('B') ? HELV_BOLD : HELV;
  let w = 0;
  for (const ch of text) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? table[c - 32] : 556; }
  return w * size / 1000;
}
const fontOf = (r) => (r.code ? 'C' : r.b && r.i ? 'BI' : r.b ? 'B' : r.i ? 'I' : 'R');

const PAGE = { w: 612, h: 792, m: 72 };

export function pdf(blocks, dc = {}) {
  const pages = [];
  let ops = [];
  let y = 0;
  const newPage = () => { if (ops.length || pages.length === 0) { if (ops.length) pages.push(ops); } ops = []; y = PAGE.h - PAGE.m; };
  newPage();
  const ensure = (h) => { if (y - h < PAGE.m) { pages.push(ops); ops = []; y = PAGE.h - PAGE.m; } };

  /** Lay out runs into lines no wider than `max`, word by word. */
  function wrap(runs, size, max, firstMax = max) {
    const words = [];
    for (const r of runs) {
      if (r.t === '\n') { words.push({ br: true }); continue; }
      const f = fontOf(r);
      const parts = toWin(r.t).split(/( +)/);
      for (const p of parts) if (p) words.push({ t: p, f, link: !!r.href, space: /^ +$/.test(p) });
    }
    const lines = [];
    let line = [];
    let w = 0;
    let limit = firstMax;
    const push = () => { while (line.length && line.at(-1).space) line.pop(); lines.push(line); line = []; w = 0; limit = max; };
    for (const wd of words) {
      if (wd.br) { push(); continue; }
      const ww = width(wd.t, wd.f, size);
      if (wd.space && !line.length) continue;
      if (w + ww > limit && line.length && !wd.space) push();
      if (ww > limit && !wd.space) {
        // A word longer than the line (a long web address): break it.
        let rest = wd.t;
        while (rest) {
          let n = rest.length;
          while (n > 1 && width(rest.slice(0, n), wd.f, size) > limit - w) n--;
          line.push({ ...wd, t: rest.slice(0, n) });
          rest = rest.slice(n);
          if (rest) push(); else w += width(line.at(-1).t, wd.f, size);
        }
        continue;
      }
      line.push(wd);
      w += ww;
    }
    if (line.length) push();
    return lines;
  }

  function drawLine(line, x, size, color = '0 0 0') {
    // Words in the same font and colour go out as one string, so the reader spaces them.
    const segs = [];
    for (const wd of line) {
      const last = segs.at(-1);
      if (last && last.f === wd.f && last.link === wd.link) last.t += wd.t;
      else segs.push({ ...wd });
    }
    let cx = x;
    for (const sg of segs) {
      const c = sg.link ? '0.02 0.38 0.76' : color;
      ops.push(`BT ${c} rg /${sg.f} ${size} Tf ${cx.toFixed(2)} ${y.toFixed(2)} Td (${escPdf(sg.t)}) Tj ET`);
      cx += width(sg.t, sg.f, size);
    }
  }

  function paragraph(runs, { size = 11, lead = size * 1.4, x = PAGE.m, indent = 0, hanging = 0, color, after = 8, before = 0, keep = false } = {}) {
    const max = PAGE.w - PAGE.m - x - indent;
    const lines = wrap(runs, size, max - hanging, max);
    if (!lines.length) lines.push([]);
    y -= before;
    if (keep) ensure(lead * Math.min(lines.length, 2) + 40);
    lines.forEach((line, i) => {
      ensure(lead);
      y -= size;
      drawLine(line, x + indent + (i ? hanging : 0), size, color);
      y -= lead - size;
    });
    y -= after;
  }

  for (const b of blocks) {
    switch (b.type) {
      case 'heading': {
        const size = [20, 16, 13.5, 12, 11, 11][b.level - 1];
        paragraph(b.runs.map((r) => ({ ...r, b: true })), { size, lead: size * 1.3, before: b.level <= 2 ? 10 : 6, after: 6, keep: true });
        break;
      }
      case 'para':
        if (b.style === 'title') paragraph(b.runs.map((r) => ({ ...r, b: true })), { size: 24, lead: 30, after: 4 });
        else if (b.style === 'subtitle') paragraph(b.runs, { size: 12, color: '0.35 0.35 0.35', after: 18 });
        else if (b.style === 'reference') paragraph(b.runs, { hanging: 36, lead: 18, after: 6 });
        else paragraph(b.runs);
        break;
      case 'quote': {
        const top = y;
        paragraph(b.runs.map((r) => ({ ...r, i: true })), { indent: 24, color: '0.25 0.25 0.25' });
        if (y < top) ops.push(`0.75 0.75 0.75 RG 1.5 w ${PAGE.m + 10} ${top - 2} m ${PAGE.m + 10} ${y + 8} l S`);
        break;
      }
      case 'item': {
        const indent = 18 + b.level * 18;
        const mark = b.ordered ? `${b.n}.` : ['•', '-', '-', '•'][Math.min(b.level, 3)];
        const box = b.checked != null ? (b.checked ? '[x] ' : '[ ] ') : '';
        ensure(15);
        const markY = y - 11;
        ops.push(`BT 0 0 0 rg /R 11 Tf ${(PAGE.m + indent - 14).toFixed(2)} ${markY.toFixed(2)} Td (${escPdf(toWin(mark))}) Tj ET`);
        paragraph(box ? [{ t: box }, ...b.runs] : b.runs, { indent, after: 3 });
        break;
      }
      case 'code': {
        const lines = b.text.split('\n');
        for (const l of lines) { ensure(13); y -= 9.5; ops.push(`BT 0.2 0.2 0.2 rg /C 9.5 Tf ${PAGE.m + 8} ${y.toFixed(2)} Td (${escPdf(toWin(l))}) Tj ET`); y -= 3.5; }
        y -= 8;
        break;
      }
      case 'rule':
        ensure(16);
        y -= 8;
        ops.push(`0.75 0.75 0.75 RG 0.75 w ${PAGE.m} ${y} m ${PAGE.w - PAGE.m} ${y} l S`);
        y -= 10;
        break;
      case 'table': {
        const cols = Math.max(...b.rows.map((r) => r.length));
        const cw = (PAGE.w - 2 * PAGE.m) / cols;
        const size = 9.5;
        for (const [ri, row] of b.rows.entries()) {
          const cells = Array.from({ length: cols }, (_, c) => wrap((row[c] ?? []).map((r) => (ri === 0 ? { ...r, b: true } : r)), size, cw - 8));
          const h = Math.max(1, ...cells.map((c) => c.length)) * 13 + 6;
          ensure(h);
          if (ri === 0) ops.push(`0.95 0.95 0.95 rg ${PAGE.m} ${(y - h).toFixed(2)} ${PAGE.w - 2 * PAGE.m} ${h.toFixed(2)} re f`);
          const top = y;
          cells.forEach((lines, c) => {
            y = top - 3;
            for (const line of lines) { y -= size; drawLine(line, PAGE.m + c * cw + 4, size); y -= 13 - size; }
          });
          y = top - h;
          ops.push(`0.75 0.75 0.75 RG 0.5 w ${PAGE.m} ${y.toFixed(2)} m ${PAGE.w - PAGE.m} ${y.toFixed(2)} l S`);
        }
        y -= 10;
        break;
      }
      default:
    }
  }
  if (ops.length) pages.push(ops);
  if (!pages.length) pages.push([]);

  // Page numbers.
  pages.forEach((p, i) => p.push(`BT 0.45 0.45 0.45 rg /R 9 Tf ${PAGE.w / 2 - 10} 40 Td (${i + 1} / ${pages.length}) Tj ET`));
  return assemble(pages, dc);
}

function assemble(pages, dc) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add(null);
  const pagesId = add(null);
  const fontIds = Object.fromEntries(KEYS.map((k) => [k, add(`<< /Type /Font /Subtype /Type1 /BaseFont /${FONTS[k]} /Encoding /WinAnsiEncoding >>`)]));
  const fontDict = `<< ${KEYS.map((k) => `/${k} ${fontIds[k]} 0 R`).join(' ')} >>`;
  const kids = [];
  for (const p of pages) {
    const stream = p.join('\n');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] /Resources << /Font ${fontDict} >> /Contents ${content} 0 R >>`));
  }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const xe = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bag = (tag, items, kind = 'Bag') => (items.length ? `<dc:${tag}><rdf:${kind}>${items.map((i) => `<rdf:li>${xe(i)}</rdf:li>`).join('')}</rdf:${kind}></dc:${tag}>` : '');
  const xmp = `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">`
    + `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xe(dc.title)}</rdf:li></rdf:Alt></dc:title>${bag('creator', list(dc.creator), 'Seq')}${bag('subject', list(dc.subject))}`
    + `${dc.description ? `<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xe(dc.description)}</rdf:li></rdf:Alt></dc:description>` : ''}${bag('publisher', list(dc.publisher))}${bag('contributor', list(dc.contributor))}${bag('date', list(dc.date), 'Seq')}`
    + `${bag('identifier', list(dc.identifier))}${bag('language', list(dc.language))}${dc.rights ? `<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xe(dc.rights)}</rdf:li></rdf:Alt></dc:rights>` : ''}<dc:format>application/pdf</dc:format>`
    + `<pdf:Producer>Dashi</pdf:Producer></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
  const xmpBytes = String.fromCharCode(...new TextEncoder().encode(xmp));
  const meta = add(`<< /Type /Metadata /Subtype /XML /Length ${xmpBytes.length} >>\nstream\n${xmpBytes}\nendstream`);
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /Metadata ${meta} 0 R /Lang (${escPdf(toWin(dc.language || 'en'))}) >>`;
  const str = (s) => `(${escPdf(toWin(s ?? ''))})`;
  const d = new Date();
  const pdfDate = `D:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}00Z`;
  const info = add(`<< /Title ${str(dc.title)} /Author ${str(list(dc.creator).join('; '))} /Subject ${str(dc.description ? dc.description.slice(0, 300) : dc.source)} /Keywords ${str(list(dc.subject).join(', '))} /Creator (Dashi) /Producer (Dashi) /CreationDate (${pdfDate}) >>`);

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

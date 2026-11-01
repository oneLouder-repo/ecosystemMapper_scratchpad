/**
 * Downloads from the library: a Dashi doc, a reference list or a weekly
 * newsletter as PDF, Word, OpenDocument, HTML or Markdown, plus metadata as
 * Dublin Core XML and CSL JSON. Everything is made in the browser.
 */
import { parseMarkdown, toHtml } from '../core/markdown.js';
import { docx, odt } from '../core/office.js';
import { pdf } from '../core/pdf.js';
import { dublinCore, dublinCoreXml, cslJson, apaReference, runsToHtml, runsToMarkdown, sortKey, creatorsBy, fullName, apaDate } from '../platform/library.js';

export const FORMATS = [
  { id: 'pdf', label: 'PDF', ext: 'pdf', type: 'application/pdf' },
  { id: 'docx', label: 'Word', ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'odt', label: 'OpenDocument', ext: 'odt', type: 'application/vnd.oasis.opendocument.text' },
  { id: 'html', label: 'Web page', ext: 'html', type: 'text/html' },
  { id: 'md', label: 'Markdown', ext: 'md', type: 'text/markdown' },
];

export const fileName = (title, ext) => `${String(title || 'document').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'document'}.${ext}`;

export function download(data, name, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A standalone web page, with the Dublin Core record in its head. */
export function htmlPage(title, bodyHtml, dc = {}) {
  const meta = Object.entries(dc).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).filter(Boolean).map((x) => `<meta name="DC.${k}" content="${esc(x)}">`)).join('\n');
  return `<!doctype html>
<html lang="${esc(dc.language || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="schema.DC" href="http://purl.org/dc/elements/1.1/">
${meta}
<style>
body { font: 16px/1.6 Georgia, 'Times New Roman', serif; color: #1d1d1b; max-width: 46rem; margin: 3rem auto; padding: 0 1.2rem; }
h1, h2, h3, h4 { font-family: system-ui, sans-serif; line-height: 1.25; }
h1 { font-size: 2rem; margin-bottom: .2rem; } .subtitle { color: #666; margin-top: 0; font-family: system-ui, sans-serif; }
blockquote { border-left: 3px solid #ccc; margin: 1rem 0; padding-left: 1rem; color: #444; font-style: italic; }
pre { background: #f4f4f2; padding: .8rem; overflow: auto; font-size: .85rem; } code { font-size: .9em; }
table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #ccc; padding: .35rem .6rem; text-align: left; } th { background: #f4f4f2; }
.reference { padding-left: 2.5rem; text-indent: -2.5rem; }
@media print { body { margin: 0; max-width: none; font-size: 11pt; } a { color: inherit; } }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

/** The title block for a document: its title and "By … · date". */
function titleBlocks(title, dc, body) {
  const firstHeading = body.find((b) => b.type === 'heading');
  if (firstHeading?.level === 1 && body.indexOf(firstHeading) === 0) return [];
  const by = [dc.creator?.length ? `By ${dc.creator.join(', ')}` : '', dc.date ? apaDate(dc.date, { full: true }) : ''].filter(Boolean).join(' · ');
  return [{ type: 'para', style: 'title', runs: [{ t: title }] }, by && { type: 'para', style: 'subtitle', runs: [{ t: by }] }].filter(Boolean);
}

/** Markdown (with a title and Dublin Core) to a file of the chosen format → Blob. */
export async function renderMarkdown(markdown, format, { title = 'Untitled', dc = {}, extraBlocks = [] } = {}) {
  const body = [...parseMarkdown(markdown), ...extraBlocks];
  const blocks = [...titleBlocks(title, dc, body), ...body];
  const f = FORMATS.find((x) => x.id === format);
  switch (format) {
    case 'pdf': return new Blob([pdf(blocks, { ...dc, title })], { type: f.type });
    case 'docx': return new Blob([await docx(blocks, { ...dc, title })], { type: f.type });
    case 'odt': return new Blob([await odt(blocks, { ...dc, title })], { type: f.type });
    case 'html': return new Blob([htmlPage(title, blocksHtml(blocks), { ...dc, title })], { type: f.type });
    case 'md': {
      const front = ['---', `title: "${title.replace(/"/g, '\\"')}"`, dc.creator?.length && `author: [${dc.creator.map((c) => `"${c}"`).join(', ')}]`, dc.date && `date: ${dc.date}`, dc.subject?.length && `keywords: [${dc.subject.map((s) => `"${s}"`).join(', ')}]`, dc.description && `abstract: "${dc.description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, dc.language && `lang: ${dc.language}`, dc.rights && `rights: "${dc.rights}"`, '---', ''].filter(Boolean).join('\n');
      const refs = extraBlocks.length ? `\n\n${extraBlocks.map((b) => (b.style === 'reference' ? runsToMarkdown(b.runs.map((r) => ({ t: r.t, i: r.i }))) : b.type === 'heading' ? `${'#'.repeat(b.level)} ${b.runs.map((r) => r.t).join('')}` : b.runs.map((r) => r.t).join(''))).join('\n\n')}\n` : '';
      return new Blob([`${front}\n${markdown.trim()}\n${refs}`], { type: f.type });
    }
    default: throw new Error(`Unknown format ${format}`);
  }
}

/** Blocks to HTML, with title and reference styles. */
function blocksHtml(blocks) {
  const special = (b) => (b.style === 'title' ? `<h1>${esc(b.runs.map((r) => r.t).join(''))}</h1>` : b.style === 'subtitle' ? `<p class="subtitle">${esc(b.runs.map((r) => r.t).join(''))}</p>` : b.style === 'reference' ? `<p class="reference">${runsToHtml(b.runs.map((r) => ({ t: r.t, i: r.i })))}</p>` : null);
  const out = [];
  let plain = [];
  const flush = () => { if (plain.length) { out.push(toHtml(plain)); plain = []; } };
  for (const b of blocks) {
    const s = b.type === 'para' && special(b);
    if (s) { flush(); out.push(s); } else plain.push(b);
  }
  flush();
  return out.join('\n');
}

/** Reference-list blocks (APA, hanging indent) for a set of items. */
export function referenceBlocks(items, heading = 'References') {
  const sorted = [...items].sort((a, b) => sortKey(a.meta).localeCompare(sortKey(b.meta)));
  return [
    heading && { type: 'heading', level: 2, runs: [{ t: heading }] },
    ...sorted.map((it) => ({ type: 'para', style: 'reference', runs: apaReference(it.meta) })),
  ].filter(Boolean);
}

/** Download a Dashi doc. */
export async function exportDoc(item, format) {
  const dc = dublinCore(item);
  const f = FORMATS.find((x) => x.id === format);
  download(await renderMarkdown(item.body ?? '', format, { title: item.meta.title || 'Untitled', dc }), fileName(item.meta.title, f.ext), f.type);
}

/** Print a doc (or anything as HTML) with the browser, which can save as PDF too. */
export function printHtml(title, markdownOrHtml, { dc = {}, isHtml = false } = {}) {
  const w = window.open('', '_blank');
  if (!w) { alert('Your browser blocked the print window. Allow pop-ups for this site, or download a PDF instead.'); return; }
  const body = isHtml ? markdownOrHtml : blocksHtml([...titleBlocks(title, dc, parseMarkdown(markdownOrHtml)), ...parseMarkdown(markdownOrHtml)]);
  w.document.write(htmlPage(title, body, dc));
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export const exportDublinCore = (item) => download(dublinCoreXml(item), fileName(item.meta.title, 'dc.xml'), 'application/xml');
export const exportCsl = (items, name = 'references') => download(cslJson(items), fileName(name, 'json'), 'application/vnd.citationstyles.csl+json');

/** Who and when, for a byline. */
export const byline = (meta) => [creatorsBy(meta, 'author').map(fullName).join(', '), apaDate(meta.issued)].filter((x) => x && x !== 'n.d.').join(' · ');

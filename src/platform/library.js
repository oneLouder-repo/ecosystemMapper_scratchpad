/**
 * The document library: an org's files, Dashi docs, links and references,
 * and its annotated bibliographies. One document, "library":
 *
 *   items    { id: { kind, meta, tags, folderId, file?, body?, url?, … } }
 *            kind: 'file' (an upload), 'doc' (a Dashi doc, Markdown in `body`),
 *            'link' (a web page), 'gdoc' (a Google Doc, Sheet or Slides link) or
 *            'ref' (a reference with nothing attached, e.g. imported from Zotero)
 *   folders  { id: { name, parentId } }
 *   bibs     { id: { title, description, itemIds, annotations, lexicon, groups, weeks } }
 *
 * `meta` is one record of bibliographic metadata for every kind, at the
 * grain of CSL (what Zotero and citation styles use), so it can make an APA
 * reference, a Dublin Core record, and CSL JSON in and out:
 *
 *   type, title, creators: [{ role, family, given } | { role, literal }],
 *   issued ('2021', '2021-03', '2021-03-05'), containerTitle, collectionTitle,
 *   collectionNumber, volume, issue, page, edition, number, genre, medium,
 *   publisher, publisherPlace, event, eventPlace, archive, DOI, ISBN, ISSN,
 *   URL, accessed, abstract, language, keywords [], rights, note
 *
 * Everything here is pure (no DOM), so the server and tests can use it.
 */
import { uid } from '../core/ops.js';

/* ---------- Metadata ---------- */

/** Item types: CSL's names, with what APA calls them and which fields they use. */
export const TYPES = [
  { id: 'article-journal', label: 'Journal article', fields: ['containerTitle', 'volume', 'issue', 'page', 'DOI', 'ISSN', 'URL'] },
  { id: 'book', label: 'Book', fields: ['edition', 'publisher', 'publisherPlace', 'collectionTitle', 'collectionNumber', 'ISBN', 'DOI', 'URL'] },
  { id: 'chapter', label: 'Book chapter', fields: ['containerTitle', 'edition', 'page', 'publisher', 'publisherPlace', 'ISBN', 'DOI', 'URL'] },
  { id: 'report', label: 'Report or grey literature', fields: ['genre', 'number', 'publisher', 'publisherPlace', 'collectionTitle', 'DOI', 'URL'] },
  { id: 'webpage', label: 'Web page', fields: ['containerTitle', 'URL', 'accessed'] },
  { id: 'article-newspaper', label: 'Newspaper article', fields: ['containerTitle', 'page', 'URL'] },
  { id: 'article-magazine', label: 'Magazine article', fields: ['containerTitle', 'volume', 'issue', 'page', 'URL'] },
  { id: 'thesis', label: 'Thesis or dissertation', fields: ['genre', 'publisher', 'archive', 'URL'] },
  { id: 'paper-conference', label: 'Conference paper', fields: ['genre', 'event', 'eventPlace', 'containerTitle', 'page', 'DOI', 'URL'] },
  { id: 'dataset', label: 'Data set', fields: ['edition', 'publisher', 'DOI', 'URL'] },
  { id: 'legislation', label: 'Legislation or policy', fields: ['number', 'containerTitle', 'publisher', 'URL'] },
  { id: 'broadcast', label: 'Podcast or broadcast episode', fields: ['number', 'containerTitle', 'publisher', 'medium', 'URL'] },
  { id: 'interview', label: 'Interview', fields: ['medium', 'URL'] },
  { id: 'manuscript', label: 'Unpublished or draft', fields: ['genre', 'archive', 'URL'] },
  { id: 'document', label: 'Other document', fields: ['genre', 'publisher', 'publisherPlace', 'URL'] },
];
export const typeOf = (id) => TYPES.find((t) => t.id === id) ?? TYPES.at(-1);

/** Every metadata field, with its label and the CSL variable it maps to. */
export const FIELDS = {
  title: { label: 'Title', csl: 'title' },
  containerTitle: { label: 'In (journal, book, site, podcast)', csl: 'container-title' },
  collectionTitle: { label: 'Series', csl: 'collection-title' },
  collectionNumber: { label: 'Number in series', csl: 'collection-number' },
  volume: { label: 'Volume', csl: 'volume' },
  issue: { label: 'Issue', csl: 'issue' },
  page: { label: 'Pages', csl: 'page' },
  edition: { label: 'Edition or version', csl: 'edition' },
  number: { label: 'Report, bill or episode number', csl: 'number' },
  genre: { label: 'Kind (e.g. Policy brief, Doctoral dissertation)', csl: 'genre' },
  medium: { label: 'Medium (e.g. Audio podcast episode)', csl: 'medium' },
  publisher: { label: 'Publisher, university or site owner', csl: 'publisher' },
  publisherPlace: { label: 'Place', csl: 'publisher-place' },
  event: { label: 'Event (conference)', csl: 'event-title' },
  eventPlace: { label: 'Event place', csl: 'event-place' },
  archive: { label: 'Archive or database', csl: 'archive' },
  DOI: { label: 'DOI', csl: 'DOI' },
  ISBN: { label: 'ISBN', csl: 'ISBN' },
  ISSN: { label: 'ISSN', csl: 'ISSN' },
  URL: { label: 'Web address', csl: 'URL' },
  accessed: { label: 'Accessed (for pages that change)', csl: 'accessed', date: true },
  issued: { label: 'Date', csl: 'issued', date: true },
  abstract: { label: 'Abstract', csl: 'abstract' },
  language: { label: 'Language', csl: 'language' },
  rights: { label: 'Rights or licence', csl: 'license' },
  note: { label: 'Note', csl: 'note' },
};
export const ROLES = ['author', 'editor', 'translator', 'director', 'host', 'guest', 'interviewer', 'producer', 'contributor'];

export const blankMeta = (over = {}) => ({ type: 'document', title: '', creators: [], issued: '', keywords: [], language: 'en', ...over });

export const blankLibrary = () => ({ items: {}, folders: {}, bibs: {} });
export function migrateLibrary(doc) {
  doc.items ??= {};
  doc.folders ??= {};
  doc.bibs ??= {};
  for (const it of Object.values(doc.items)) { it.meta = { ...blankMeta(), ...(it.meta ?? {}) }; it.tags ??= []; }
  for (const b of Object.values(doc.bibs)) migrateBib(b);
  return doc;
}
export function migrateBib(b) {
  b.itemIds ??= [];
  b.annotations ??= {};
  b.lexicon ??= { facets: {}, terms: {}, cells: {}, constrainTags: false };
  b.lexicon.cells ??= {};
  b.groups ??= [];
  b.weeks ??= {};
  return b;
}
export const blankBib = (title) => migrateBib({ id: uid('bib'), title, description: '' });

/** Pick an item kind and file type from a filename. */
export const extOf = (name = '') => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
export const FILE_KINDS = {
  pdf: { label: 'PDF', icon: 'doc', tone: '#c43c3c' },
  docx: { label: 'Word', icon: 'doc', tone: '#2b5cb8' }, doc: { label: 'Word', icon: 'doc', tone: '#2b5cb8' }, odt: { label: 'OpenDocument text', icon: 'doc', tone: '#2b5cb8' }, rtf: { label: 'Rich text', icon: 'doc', tone: '#2b5cb8' },
  xlsx: { label: 'Excel', icon: 'chart', tone: '#1d7a46' }, xls: { label: 'Excel', icon: 'chart', tone: '#1d7a46' }, ods: { label: 'OpenDocument sheet', icon: 'chart', tone: '#1d7a46' }, csv: { label: 'CSV', icon: 'chart', tone: '#1d7a46' },
  pptx: { label: 'PowerPoint', icon: 'story', tone: '#c4622d' }, ppt: { label: 'PowerPoint', icon: 'story', tone: '#c4622d' }, odp: { label: 'OpenDocument slides', icon: 'story', tone: '#c4622d' },
  png: { label: 'Image', icon: 'media', tone: '#7a5a2f' }, jpg: { label: 'Image', icon: 'media', tone: '#7a5a2f' }, jpeg: { label: 'Image', icon: 'media', tone: '#7a5a2f' }, gif: { label: 'Image', icon: 'media', tone: '#7a5a2f' }, webp: { label: 'Image', icon: 'media', tone: '#7a5a2f' },
  txt: { label: 'Text', icon: 'doc', tone: '#555' }, md: { label: 'Markdown', icon: 'doc', tone: '#555' }, json: { label: 'JSON', icon: 'doc', tone: '#555' }, bib: { label: 'BibTeX', icon: 'book', tone: '#555' }, ris: { label: 'RIS', icon: 'book', tone: '#555' },
  epub: { label: 'E-book', icon: 'book', tone: '#7a5a2f' }, zip: { label: 'Zip', icon: 'download', tone: '#555' },
};
export const ACCEPT = Object.keys(FILE_KINDS).map((e) => `.${e}`).join(',');

/** A Dashi ecosystem map file (saved from the Mapper), kept in the library. */
export const isMapFile = (item) => item?.kind === 'file' && /\.dashi-map\.json$/i.test(item.file?.name ?? '');

/** What to call an item's format, for lists. */
export function formatLabel(item) {
  if (isMapFile(item)) return 'Ecosystem map';
  if (item.kind === 'doc') return 'Dashi doc';
  if (item.kind === 'gdoc') return /spreadsheets/.test(item.url) ? 'Google Sheet' : /presentation/.test(item.url) ? 'Google Slides' : 'Google Doc';
  if (item.kind === 'link') return 'Web link';
  if (item.kind === 'ref') return 'Reference';
  return FILE_KINDS[extOf(item.file?.name)]?.label ?? 'File';
}

/** A title from a filename: "state_of_housing-2023.pdf" → "State of housing 2023". */
export const titleFromName = (name) => {
  const t = String(name).replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/* ---------- Names and dates ---------- */

export const creatorsBy = (meta, role) => (meta.creators ?? []).filter((c) => (c.role ?? 'author') === role);
const initials = (given = '') => given.split(/\s+/).filter(Boolean).map((g) => g.split('-').map((p) => `${p[0].toUpperCase()}.`).join('-')).join(' ');
/** "Okafor, A. B." (APA's order for authors). */
export const nameInverted = (c) => (c.literal ? c.literal : [c.family, initials(c.given)].filter(Boolean).join(', '));
/** "A. B. Okafor" (APA's order for editors and hosts in the middle of a reference). */
export const nameForward = (c) => (c.literal ? c.literal : [initials(c.given), c.family].filter(Boolean).join(' '));
export const fullName = (c) => (c.literal ? c.literal : [c.given, c.family].filter(Boolean).join(' '));

/** Parse "Okafor, Amara" / "Amara Okafor" / "UNESCO" into a creator. */
export function parseName(text, role = 'author') {
  const s = String(text).trim().replace(/\s+/g, ' ');
  if (!s) return null;
  if (/^\{.*\}$/.test(s)) return { role, literal: s.slice(1, -1) };
  if (s.includes(',')) { const [family, ...rest] = s.split(','); return { role, family: family.trim(), given: rest.join(',').trim() }; }
  const parts = s.split(' ');
  if (parts.length === 1) return { role, literal: s };
  // Organisations: several capitalised words with "of", "for", "and", or all caps.
  if (/\b(of|for|and|the|institute|council|ministry|department|centre|center|association|foundation|network|agency|commission|university)\b/i.test(s)) return { role, literal: s };
  return { role, family: parts.at(-1), given: parts.slice(0, -1).join(' ') };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const yearOf = (issued) => (String(issued ?? '').match(/^\d{4}/)?.[0] ?? '');
/** APA's date in a reference: "2021", "2021, March", "2021, March 5", "n.d.". */
export function apaDate(issued, { full = false } = {}) {
  const m = String(issued ?? '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return 'n.d.';
  if (!full || !m[2]) return m[1];
  return `${m[1]}, ${MONTHS[+m[2] - 1]}${m[3] ? ` ${+m[3]}` : ''}`;
}

/* ---------- APA 7 references ---------- */

/**
 * A reference as runs of text, some in italics: [{ t, i }]. Render with
 * runsToHtml / runsToMarkdown / runsToText, or into Word runs.
 */
export function apaReference(meta) {
  const r = [];
  const add = (t, i = false) => { if (t) r.push({ t, i }); };
  const type = meta.type ?? 'document';
  const title = (meta.title || 'Untitled').trim();
  const authors = creatorsBy(meta, 'author').concat(creatorsBy(meta, 'host').map((c) => ({ ...c, suffix: ' (Host)' })));
  const editors = creatorsBy(meta, 'editor');
  const fullDate = ['article-newspaper', 'article-magazine', 'webpage', 'broadcast', 'interview', 'paper-conference'].includes(type);
  const date = `(${apaDate(meta.issued, { full: fullDate })}).`;
  const italicTitle = !['article-journal', 'chapter', 'article-newspaper', 'article-magazine', 'broadcast'].includes(type);
  const end = (s) => (/[.?!]$/.test(s) ? s : `${s}.`);

  // Who, or the title in their place.
  let titleDone = false;
  if (authors.length) add(`${end(nameList(authors.map((c) => nameInverted(c) + (c.suffix ?? ''))))} `);
  else if (editors.length && ['book', 'report'].includes(type)) add(`${nameList(editors.map(nameInverted))} (${editors.length > 1 ? 'Eds.' : 'Ed.'}). `);
  else { add(end(title), italicTitle); add(' '); titleDone = true; }
  add(`${date} `);

  // The title, with what kind of thing it is in square brackets.
  const bracket = {
    thesis: meta.genre ? `[${meta.genre}${meta.publisher ? `, ${meta.publisher}` : ''}]` : `[Thesis${meta.publisher ? `, ${meta.publisher}` : ''}]`,
    'paper-conference': `[${meta.genre || 'Paper presentation'}]`,
    dataset: '[Data set]',
    broadcast: `[${meta.medium || 'Audio podcast episode'}]`,
    interview: meta.medium ? `[${meta.medium}]` : '',
    manuscript: `[${meta.genre || 'Unpublished manuscript'}]`,
  }[type] ?? (meta.genre && ['report', 'manuscript', 'document'].includes(type) ? '' : '');
  const paren = [];
  const translators = creatorsBy(meta, 'translator');
  if (translators.length) paren.push(`${nameList(translators.map(nameForward), { forward: true })}, Trans.`);
  if (meta.edition && ['book', 'chapter', 'dataset'].includes(type)) paren.push(type === 'dataset' ? `Version ${meta.edition}` : `${ordinal(meta.edition)} ed.`);
  if (meta.number && ['report', 'broadcast'].includes(type)) paren.push(`${type === 'report' ? (meta.genre ? `${meta.genre} No.` : 'Report No.') : 'No.'} ${meta.number}`);
  if (meta.number && type === 'legislation') paren.push(meta.number);
  if (!titleDone) {
    add(title.replace(/[.]$/, ''), italicTitle);
    if (paren.length) add(` (${paren.join(', ')})`);
    if (bracket) add(` ${bracket}`);
    add('. ');
  } else if (paren.length || bracket) {
    add(`${paren.length ? `(${paren.join(', ')}) ` : ''}${bracket ? `${bracket}. ` : ''}`.replace(/\) $/, '). '));
  }

  // Where it appeared.
  const pages = meta.page ? String(meta.page).replace(/-+/g, '–') : '';
  switch (type) {
    case 'article-journal':
    case 'article-magazine':
      if (meta.containerTitle) {
        add(meta.containerTitle, true);
        if (meta.volume) { add(', '); add(String(meta.volume), true); }
        if (meta.issue) add(meta.volume ? `(${meta.issue})` : `, (${meta.issue})`);
        if (pages) add(`, ${pages}`);
        add('. ');
      }
      break;
    case 'article-newspaper':
      if (meta.containerTitle) { add(meta.containerTitle, true); if (pages) add(`, ${pages}`); add('. '); }
      break;
    case 'chapter': {
      add('In ');
      if (editors.length) add(`${nameList(editors.map(nameForward), { forward: true })} (${editors.length > 1 ? 'Eds.' : 'Ed.'}), `);
      add(meta.containerTitle || 'Untitled book', true);
      const bits = [meta.edition && `${ordinal(meta.edition)} ed.`, pages && `pp. ${pages}`].filter(Boolean);
      if (bits.length) add(` (${bits.join(', ')})`);
      add('. ');
      if (meta.publisher) add(`${end(meta.publisher)} `);
      break;
    }
    case 'broadcast':
      if (meta.containerTitle) { add('In '); add(meta.containerTitle, true); add('. '); }
      if (meta.publisher) add(`${end(meta.publisher)} `);
      break;
    case 'paper-conference':
      if (meta.event) add(`${end([meta.event, meta.eventPlace].filter(Boolean).join(', '))} `);
      break;
    case 'webpage':
      if (meta.containerTitle && !authors.some((a) => a.literal === meta.containerTitle)) add(`${end(meta.containerTitle)} `);
      break;
    case 'thesis':
      if (meta.archive) add(`${end(meta.archive)} `);
      break;
    default:
      // Books, reports and the rest: the publisher, unless it is also the author.
      if (meta.publisher && !authors.some((a) => (a.literal ?? '').toLowerCase() === meta.publisher.toLowerCase())) add(`${end(meta.publisher)} `);
  }

  // Retrieved date only for pages that change; then the DOI or address.
  if (meta.accessed && type === 'webpage' && meta.URL) add(`Retrieved ${apaDate(meta.accessed, { full: true }).replace(/^(\d{4}), (.*)$/, '$2, $1')}, from `);
  if (meta.DOI) add(`https://doi.org/${String(meta.DOI).replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`);
  else if (meta.URL) add(meta.URL);
  return tidyRuns(r);
}

function nameList(names, { forward = false } = {}) {
  if (names.length <= 1) return names[0] ?? '';
  // "In A. Editor & B. Editor (Eds.)": no comma between two names written forwards.
  if (forward) return names.length === 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')}, & ${names.at(-1)}`;
  if (names.length <= 20) return `${names.slice(0, -1).join(', ')}, & ${names.at(-1)}`;
  return `${names.slice(0, 19).join(', ')}, … ${names.at(-1)}`;
}
const ordinal = (n) => {
  const x = parseInt(n, 10);
  if (!x) return String(n);
  const s = x % 100 >= 11 && x % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[x % 10] ?? 'th');
  return `${x}${s}`;
};
function tidyRuns(runs) {
  const out = [];
  for (const run of runs) {
    const last = out.at(-1);
    if (last && last.i === run.i) last.t += run.t;
    else out.push({ ...run });
  }
  if (out.length) out[out.length - 1].t = out.at(-1).t.replace(/\s+$/, '');
  return out;
}

/** APA in-text citation: "(Okafor & Lee, 2021)" / narrative "Okafor et al. (2021)". */
export function apaCitation(meta, { narrative = false } = {}) {
  const a = creatorsBy(meta, 'author');
  const fam = (c) => c.literal ?? c.family ?? '';
  const who = a.length === 0 ? `“${(meta.title || 'Untitled').split(/[:.?]/)[0]}”` : a.length === 1 ? fam(a[0]) : a.length === 2 ? `${fam(a[0])} ${narrative ? 'and' : '&'} ${fam(a[1])}` : `${fam(a[0])} et al.`;
  const y = yearOf(meta.issued) || 'n.d.';
  return narrative ? `${who} (${y})` : `(${who}, ${y})`;
}

/** Sort key for a reference list: first author (or title), then year. */
export const sortKey = (meta) => {
  const a = creatorsBy(meta, 'author')[0];
  return `${(a ? a.literal ?? `${a.family} ${a.given ?? ''}` : meta.title ?? '').toLowerCase().replace(/^(the|a|an) /, '')} ${yearOf(meta.issued) || '0000'}`;
};
export const apaList = (metas) => [...metas].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(apaReference);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const runsToHtml = (runs) => runs.map((r) => (r.i ? `<em>${esc(r.t)}</em>` : esc(r.t))).join('').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
export const runsToMarkdown = (runs) => runs.map((r) => (r.i ? `*${r.t.trim()}*${/\s$/.test(r.t) ? ' ' : ''}` : r.t)).join('');
export const runsToText = (runs) => runs.map((r) => r.t).join('');

/* ---------- Dublin Core ---------- */

const DCMI_TYPE = { dataset: 'Dataset', broadcast: 'Sound', interview: 'Sound', webpage: 'InteractiveResource' };
/** The fifteen Dublin Core elements for an item. Repeating elements are arrays. */
export function dublinCore(item) {
  const m = item.meta ?? {};
  const authors = (m.creators ?? []).filter((c) => ['author', 'host'].includes(c.role ?? 'author'));
  const others = (m.creators ?? []).filter((c) => !['author', 'host'].includes(c.role ?? 'author'));
  return {
    title: m.title || 'Untitled',
    creator: authors.map(fullName),
    subject: [...new Set([...(m.keywords ?? []), ...(item.tags ?? [])])],
    description: m.abstract ?? '',
    publisher: m.publisher ?? '',
    contributor: others.map((c) => `${fullName(c)} (${c.role})`),
    date: m.issued ?? '',
    type: DCMI_TYPE[m.type] ?? (item.file && /^image\//.test(item.file.type) ? 'StillImage' : 'Text'),
    format: item.kind === 'doc' ? 'text/markdown' : item.file?.type ?? (item.url ? 'text/html' : ''),
    identifier: [m.DOI && `https://doi.org/${m.DOI}`, m.ISBN && `urn:isbn:${m.ISBN}`, m.ISSN && `urn:issn:${m.ISSN}`, m.URL ?? item.url].filter(Boolean),
    source: m.containerTitle ?? '',
    language: m.language ?? '',
    relation: m.collectionTitle ?? '',
    coverage: m.eventPlace ?? m.publisherPlace ?? '',
    rights: m.rights ?? '',
  };
}

/** Dublin Core as an OAI-DC XML record. */
export function dublinCoreXml(item) {
  const dc = dublinCore(item);
  const lines = Object.entries(dc).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).filter(Boolean).map((x) => `  <dc:${k}>${esc(x)}</dc:${k}>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n${lines.join('\n')}\n</oai_dc:dc>\n`;
}

/* ---------- CSL JSON, BibTeX and RIS ---------- */

const toDateParts = (s) => {
  const m = String(s ?? '').match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  return m ? { 'date-parts': [[+m[1], ...(m[2] ? [+m[2]] : []), ...(m[3] ? [+m[3]] : [])]] } : undefined;
};
const fromDateParts = (d) => {
  if (!d) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  const p = d['date-parts']?.[0];
  if (p?.[0]) return [p[0], p[1] && String(p[1]).padStart(2, '0'), p[2] && String(p[2]).padStart(2, '0')].filter(Boolean).join('-');
  return String(d.raw ?? d.literal ?? '').match(/\d{4}(-\d{2}(-\d{2})?)?/)?.[0] ?? '';
};

/** An item as CSL JSON (what Zotero, Pandoc and citeproc read). */
export function toCsl(item) {
  const m = item.meta ?? {};
  const out = { id: item.id, type: m.type ?? 'document' };
  for (const [k, f] of Object.entries(FIELDS)) {
    if (!m[k]) continue;
    out[f.csl] = f.date ? toDateParts(m[k]) : m[k];
  }
  for (const c of m.creators ?? []) {
    const role = c.role === 'contributor' ? 'author' : c.role === 'guest' ? 'author' : c.role ?? 'author';
    (out[role] ??= []).push(c.literal ? { literal: c.literal } : { family: c.family, given: c.given });
  }
  const kw = [...new Set([...(m.keywords ?? []), ...(item.tags ?? [])])];
  if (kw.length) out.keyword = kw.join(', ');
  return out;
}

const CSL_TYPE_ALIASES = { article: 'article-journal', 'entry-encyclopedia': 'chapter', 'entry-dictionary': 'chapter', post: 'webpage', 'post-weblog': 'webpage', song: 'broadcast', motion_picture: 'broadcast', speech: 'paper-conference', bill: 'legislation', regulation: 'legislation', treaty: 'legislation', legal_case: 'legislation', standard: 'report', pamphlet: 'report', personal_communication: 'manuscript', software: 'dataset' };
/** Metadata from a CSL JSON record. */
export function fromCsl(c) {
  const type = TYPES.some((t) => t.id === c.type) ? c.type : CSL_TYPE_ALIASES[c.type] ?? 'document';
  const meta = blankMeta({ type });
  for (const [k, f] of Object.entries(FIELDS)) {
    const v = c[f.csl] ?? (f.csl === 'event-title' ? c.event : undefined);
    if (v == null || v === '') continue;
    meta[k] = f.date ? fromDateParts(v) : String(v);
  }
  for (const role of [...ROLES, 'composer', 'container-author', 'collection-editor', 'recipient']) {
    for (const p of c[role] ?? []) {
      const r = ROLES.includes(role) ? role : role === 'collection-editor' ? 'editor' : 'contributor';
      meta.creators.push(p.literal ? { role: r, literal: p.literal } : { role: r, family: p.family ?? '', given: p.given ?? '' });
    }
  }
  if (c.keyword) meta.keywords = String(c.keyword).split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
  return meta;
}

const latex = (s) => String(s).replace(/\{\\['"`^~]\{?([a-zA-Z])\}?\}/g, '$1').replace(/\\&/g, '&').replace(/[{}]/g, '').replace(/~/g, ' ').replace(/--/g, '–').trim();
const BIB_TYPES = { article: 'article-journal', book: 'book', booklet: 'book', incollection: 'chapter', inbook: 'chapter', techreport: 'report', report: 'report', phdthesis: 'thesis', mastersthesis: 'thesis', thesis: 'thesis', inproceedings: 'paper-conference', conference: 'paper-conference', online: 'webpage', electronic: 'webpage', misc: 'document', unpublished: 'manuscript', dataset: 'dataset', legislation: 'legislation' };
/** Parse BibTeX or BibLaTeX into metadata records. */
export function parseBibtex(text) {
  const out = [];
  const re = /@(\w+)\s*\{\s*([^,\s]*)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    const kind = m[1].toLowerCase();
    if (['comment', 'string', 'preamble'].includes(kind)) continue;
    // Read fields up to the brace that closes this entry.
    let i = re.lastIndex;
    let depth = 1;
    const fields = {};
    while (i < text.length && depth > 0) {
      const fm = /\s*([\w-]+)\s*=\s*/y;
      fm.lastIndex = i;
      const f = fm.exec(text);
      if (!f) { if (text[i] === '}') depth--; i++; continue; }
      i = fm.lastIndex;
      let value = '';
      if (text[i] === '{') {
        let d = 0; const start = i;
        for (; i < text.length; i++) { if (text[i] === '{') d++; else if (text[i] === '}') { d--; if (d === 0) { i++; break; } } }
        value = text.slice(start + 1, i - 1);
      } else if (text[i] === '"') {
        const end = text.indexOf('"', i + 1); value = text.slice(i + 1, end); i = end + 1;
      } else {
        const end = text.slice(i).search(/[,}\n]/); value = text.slice(i, i + end); i += end;
      }
      fields[f[1].toLowerCase()] = latex(value);
      while (text[i] === ',' || /\s/.test(text[i] ?? '')) i++;
      if (text[i] === '}') { depth--; i++; }
    }
    re.lastIndex = i;
    const type = BIB_TYPES[kind] ?? 'document';
    const meta = blankMeta({ type, title: fields.title ?? '' });
    const names = (s, role) => (s ? s.split(/\s+and\s+/i).map((n) => parseName(n, role)).filter(Boolean) : []);
    meta.creators = [...names(fields.author, 'author'), ...names(fields.editor, 'editor')];
    const month = fields.month ? String(MONTHS.findIndex((x) => x.toLowerCase().startsWith(fields.month.toLowerCase().slice(0, 3))) + 1 || fields.month).padStart(2, '0') : '';
    meta.issued = fields.date ?? [fields.year, month].filter(Boolean).join('-');
    Object.assign(meta, Object.fromEntries(Object.entries({
      containerTitle: fields.journal ?? fields.journaltitle ?? fields.booktitle, volume: fields.volume, issue: fields.number && type === 'article-journal' ? fields.number : fields.issue,
      number: type !== 'article-journal' ? fields.number : undefined, page: fields.pages, edition: fields.edition, publisher: fields.publisher ?? fields.institution ?? fields.school ?? fields.organization,
      publisherPlace: fields.address ?? fields.location, DOI: fields.doi, ISBN: fields.isbn, ISSN: fields.issn, URL: fields.url, abstract: fields.abstract, language: fields.language ?? fields.langid,
      genre: fields.type ?? (kind === 'phdthesis' ? 'Doctoral dissertation' : kind === 'mastersthesis' ? 'Master’s thesis' : undefined), collectionTitle: fields.series, note: fields.note, accessed: fields.urldate,
    }).filter(([, v]) => v)));
    if (fields.keywords) meta.keywords = fields.keywords.split(/[,;]\s*/).filter(Boolean);
    out.push(meta);
  }
  return out;
}

const RIS_TYPES = { JOUR: 'article-journal', JFULL: 'article-journal', EJOUR: 'article-journal', BOOK: 'book', EBOOK: 'book', CHAP: 'chapter', ECHAP: 'chapter', RPRT: 'report', GOVDOC: 'report', THES: 'thesis', CONF: 'paper-conference', CPAPER: 'paper-conference', ELEC: 'webpage', WEB: 'webpage', NEWS: 'article-newspaper', MGZN: 'article-magazine', DATA: 'dataset', BILL: 'legislation', STAT: 'legislation', SOUND: 'broadcast', MPCT: 'broadcast', UNPB: 'manuscript', MANSCPT: 'manuscript' };
/** Parse RIS (EndNote, Mendeley, many databases) into metadata records. */
export function parseRis(text) {
  const out = [];
  let cur = null;
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9])  - ?(.*)$/);
    if (!m) continue;
    const [, tag, v] = m;
    const val = v.trim();
    if (tag === 'TY') { cur = { meta: blankMeta({ type: RIS_TYPES[val] ?? 'document' }), sp: '', ep: '' }; continue; }
    if (!cur) continue;
    const meta = cur.meta;
    if (tag === 'ER') { if (cur.sp) meta.page = cur.ep ? `${cur.sp}–${cur.ep}` : cur.sp; out.push(meta); cur = null; continue; }
    switch (tag) {
      case 'AU': case 'A1': meta.creators.push(parseName(val, 'author')); break;
      case 'A2': case 'ED': meta.creators.push(parseName(val, 'editor')); break;
      case 'TI': case 'T1': meta.title = val; break;
      case 'T2': case 'JO': case 'JF': case 'BT': meta.containerTitle ||= val; break;
      case 'T3': meta.collectionTitle = val; break;
      case 'PY': case 'Y1': case 'DA': if (!meta.issued || val.length > meta.issued.length) meta.issued = val.replace(/\//g, '-').replace(/-+$/, '').slice(0, 10); break;
      case 'VL': meta.volume = val; break;
      case 'IS': meta.issue = val; break;
      case 'SP': cur.sp = val; break;
      case 'EP': cur.ep = val; break;
      case 'PB': meta.publisher = val; break;
      case 'CY': meta.publisherPlace = val; break;
      case 'DO': meta.DOI = val; break;
      case 'SN': if (/^[\dX-]{9}$/.test(val)) meta.ISSN = val; else meta.ISBN = val; break;
      case 'UR': meta.URL ||= val; break;
      case 'AB': case 'N2': meta.abstract = val; break;
      case 'KW': meta.keywords.push(val); break;
      case 'LA': meta.language = val; break;
      case 'ET': meta.edition = val; break;
      case 'M3': meta.genre = val; break;
      case 'N1': meta.note = val; break;
      default:
    }
  }
  return out;
}

/** Read a reference file of any of the three kinds. */
export function parseReferences(text, filename = '') {
  const t = String(text).trim();
  if (/\.json$/i.test(filename) || /^[[{]/.test(t)) {
    const data = JSON.parse(t);
    const list = Array.isArray(data) ? data : data.items ?? [data];
    return list.map(fromCsl);
  }
  if (/\.ris$/i.test(filename) || /^TY {2}-/m.test(t)) return parseRis(t);
  return parseBibtex(t);
}

/** CSL JSON for a list of items. */
export const cslJson = (items) => JSON.stringify(items.map(toCsl), null, 2);

/* ---------- Words and weeks ---------- */

export const wordCount = (s) => (String(s ?? '').replace(/[#*_>`[\]()-]/g, ' ').match(/[\p{L}\p{N}’']+/gu) ?? []).length;
/** Where a word count sits against APA-style annotation lengths (200–600). */
export const annotationLength = (n, min = 200, max = 600) => (n === 0 ? 'empty' : n < min ? 'short' : n > max ? 'long' : 'ok');

/** ISO week key: "2026-W44". */
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d - Date.UTC(year, 0, 1)) / 864e5 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
/** The Monday and Sunday of an ISO week, as dates. */
export function weekRange(key) {
  const [y, w] = key.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday, end: sunday };
}
export const weekLabel = (key) => {
  const { start, end } = weekRange(key);
  const f = (d) => `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
  return `${f(start)} – ${f(end)}, ${end.getUTCFullYear()}`;
};
export const shiftWeek = (key, n) => { const { start } = weekRange(key); start.setUTCDate(start.getUTCDate() + 7 * n + 3); return weekKey(new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); };

/* ---------- Tags ---------- */

/** Every tag used in a bibliography's annotations, with counts and which tags go together. */
export function tagMap(bib, { week } = {}) {
  const counts = new Map();
  const pairs = new Map();
  for (const [itemId, a] of Object.entries(bib.annotations ?? {})) {
    if (!bib.itemIds.includes(itemId)) continue;
    if (week && weekKey(new Date(a.updatedAt ?? 0)) !== week) continue;
    const tags = [...new Set(a.tags ?? [])].sort();
    for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) {
      const k = `${tags[i]}\u0000${tags[j]}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
  }
  return {
    tags: [...counts].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag)),
    pairs: [...pairs].map(([k, n]) => { const [a, b] = k.split('\u0000'); return { a, b, n }; }).sort((x, y) => y.n - x.n),
  };
}

/**
 * Every tag in the library: on items, on annotations in any bibliography,
 * and items' keywords. → [{ tag, n, itemIds }] most used first. A tag
 * counts once per item however many places it appears.
 */
export function libraryTags(lib, { keywords = true } = {}) {
  const byTag = new Map();
  const add = (tag, itemId) => {
    const t = String(tag ?? '').trim().toLowerCase();
    if (!t || !lib.items?.[itemId]) return;
    if (!byTag.has(t)) byTag.set(t, new Set());
    byTag.get(t).add(itemId);
  };
  for (const it of Object.values(lib.items ?? {})) {
    for (const t of it.tags ?? []) add(t, it.id);
    if (keywords) for (const k of it.meta?.keywords ?? []) add(k, it.id);
  }
  for (const b of Object.values(lib.bibs ?? {})) for (const [id, a] of Object.entries(b.annotations ?? {})) for (const t of a.tags ?? []) add(t, id);
  return [...byTag].map(([tag, ids]) => ({ tag, n: ids.size, itemIds: [...ids] })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
}

/**
 * Rename (or merge) a tag everywhere: items' tags and keywords, and every
 * annotation. → { items, bibs } holding only what changed, for updates.
 */
export function renameTag(lib, from, to) {
  const f = String(from).trim().toLowerCase();
  const t = String(to).trim().toLowerCase();
  const swap = (list = [], lower = true) => {
    if (!list.some((x) => x.toLowerCase() === f)) return null;
    return [...new Set(list.map((x) => (x.toLowerCase() === f ? t : lower ? x.toLowerCase() : x)).filter(Boolean))];
  };
  const items = {};
  for (const it of Object.values(lib.items ?? {})) {
    const tags = swap(it.tags);
    const keywords = swap(it.meta?.keywords, false);
    if (tags || keywords) items[it.id] = { ...(tags && { tags }), ...(keywords && { meta: { ...it.meta, keywords } }) };
  }
  const bibs = {};
  for (const b of Object.values(lib.bibs ?? {})) {
    let changed = false;
    const annotations = Object.fromEntries(Object.entries(b.annotations ?? {}).map(([id, a]) => {
      const tags = swap(a.tags);
      if (tags) changed = true;
      return [id, tags ? { ...a, tags } : a];
    }));
    if (changed) bibs[b.id] = { annotations };
  }
  return { items, bibs };
}

/** Items with a tag (on the item, in an annotation, or as a keyword). */
export const itemsTagged = (lib, tag) => libraryTags(lib).find((t) => t.tag === String(tag).toLowerCase())?.itemIds.map((id) => lib.items[id]) ?? [];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Does a term (a word or phrase) appear in some text, allowing a plural or -al/-ic ending? */
export function mentions(text, term) {
  const t = String(term ?? '').trim().toLowerCase();
  if (t.length < 3) return false;
  const words = t.split(/\s+/).map(escapeRe);
  const last = words.pop();
  const tail = /y$/.test(last) ? `${last.slice(0, -1)}(y|ies)` : `${last}(s|es|al|ic|ly)?`;
  const re = new RegExp(`(^|[^\\p{L}])${[...words, tail].join('[\\s-]+')}($|[^\\p{L}])`, 'iu');
  return re.test(String(text ?? ''));
}

/**
 * Tags to suggest for a source, from what it says (title, abstract,
 * annotation): first the bibliography's lexicon terms it mentions, then
 * tags already used in the library that it mentions. Tags it already has
 * are left out. → [{ tag, from: 'lexicon' | 'library', facet? }]
 */
export function suggestTags(lib, bib, { title = '', abstract = '', text = '', has = [] } = {}) {
  const body = `${title}\n${abstract}\n${text}`;
  const have = new Set(has.map((t) => t.toLowerCase()));
  const out = [];
  const push = (tag, from, facet) => { const t = tag.toLowerCase(); if (!have.has(t)) { have.add(t); out.push({ tag: t, from, ...(facet && { facet }) }); } };
  for (const term of Object.values(bib?.lexicon?.terms ?? {})) if (mentions(body, term.label)) push(term.label, 'lexicon', bib.lexicon.facets[term.facetId]?.name);
  if (!bib?.lexicon?.constrainTags) for (const { tag } of libraryTags(lib)) if (mentions(body, tag)) push(tag, 'library');
  return out;
}

/* ---------- Frameworks for the weekly brief ---------- */

/**
 * The data models a weekly brief can be laid out by. Each category is
 * matched against an annotation's tags, its item's tags and keywords, and
 * the lexicon: a tag that names the category, or a lexicon term in a facet
 * of that name (or scored in the matrix), puts the source under it.
 */
export const FRAMEWORKS = [
  { id: 'themes', label: 'Top themes (tags)', categories: null },
  { id: 'steeple', label: 'STEEPLE', categories: ['Social', 'Technological', 'Economic', 'Environmental', 'Political', 'Legal', 'Ethical'] },
  { id: 'micro-meso-macro', label: 'Micro / Meso / Macro', categories: ['Micro', 'Meso', 'Macro'] },
  { id: 'water', label: 'Water of Systems Change', categories: ['Policies', 'Practices', 'Resource flows', 'Relationships', 'Power dynamics', 'Mental models'] },
];
/** Facets of the bibliography's lexicon can be a framework too: `facet:<id>`. */
export function frameworksFor(bib) {
  const facets = Object.values(bib?.lexicon?.facets ?? {}).map((f) => ({
    id: `facet:${f.id}`, label: `Lexicon facet: ${f.name}`,
    categories: Object.values(bib.lexicon.terms).filter((t) => t.facetId === f.id).map((t) => t.label),
  })).filter((f) => f.categories.length);
  return [...FRAMEWORKS, ...facets];
}
const stem = (w) => w.toLowerCase().replace(/[^\p{L}\s]/gu, '').slice(0, Math.max(4, Math.min(6, w.length - 2)));
/** Which of a framework's categories a source falls under. */
export function categoriesOf(lib, bib, itemId, categories) {
  const a = bib.annotations?.[itemId];
  const item = lib.items[itemId];
  const tags = [...(a?.tags ?? []), ...(item?.tags ?? []), ...(item?.meta?.keywords ?? [])].map((t) => t.toLowerCase());
  const lx = bib.lexicon ?? { facets: {}, terms: {}, cells: {} };
  const scored = Object.entries(lx.cells?.[itemId] ?? {}).filter(([, v]) => v > 0).map(([id]) => lx.terms[id]).filter(Boolean);
  return categories.filter((cat) => {
    const c = cat.toLowerCase();
    const s = stem(cat);
    if (tags.some((t) => t === c || (s.length >= 4 && t.startsWith(s)))) return true;
    const facet = Object.values(lx.facets ?? {}).find((f) => f.name.toLowerCase() === c);
    if (facet) {
      const terms = Object.values(lx.terms).filter((t) => t.facetId === facet.id).map((t) => t.label.toLowerCase());
      if (tags.some((t) => terms.includes(t)) || scored.some((t) => t.facetId === facet.id)) return true;
    }
    return scored.some((t) => t.label.toLowerCase() === c);
  });
}

/** The tags allowed in a bibliography: anything, or only its lexicon's terms. */
export const allowedTags = (bib) => (bib.lexicon?.constrainTags ? Object.values(bib.lexicon.terms).map((t) => t.label) : null);

/* ---------- The grouping grammar ---------- */

/**
 * Rules that sort a bibliography's items into groups. Two forms:
 *
 *   A filter:   tag:housing AND (term:equity OR year>=2020) NOT type:webpage
 *   A facet:    by tag | by year | by decade | by type | by author | by folder | by facet:<name>
 *
 * Filters have fields tag, term (a lexicon term the item scores on), facet,
 * type, year (with = < > <= >= and ranges 2015..2020), author, folder,
 * format, has:annotation, has:file, words>200 and plain words (searched in
 * the title, abstract and annotation). AND is implied between terms;
 * quote values with spaces: tag:"food security".
 */
export function parseRule(src) {
  const s = String(src ?? '').trim();
  const by = s.match(/^by\s+(tag|year|decade|type|author|folder|format|facet(?::\s*(.+))?)$/i);
  if (by) return { by: by[1].toLowerCase().startsWith('facet') ? 'facet' : by[1].toLowerCase(), facet: by[2]?.trim() };
  const tokens = [];
  const re = /\s*(\(|\)|"[^"]*"|[^\s()"]+(?:"[^"]*")?)/gy;
  let m;
  while ((m = re.exec(s))) tokens.push(m[1]);
  let i = 0;
  const peek = () => tokens[i];
  const word = (t) => t && /^(AND|OR|NOT)$/i.test(t);
  function expr() {
    let left = and();
    while (peek() && /^OR$/i.test(peek())) { i++; left = { op: 'or', a: left, b: and() }; }
    return left;
  }
  function and() {
    let left = not();
    while (peek() && peek() !== ')' && !/^OR$/i.test(peek())) {
      if (/^AND$/i.test(peek())) i++;
      left = { op: 'and', a: left, b: not() };
    }
    return left;
  }
  function not() {
    if (peek() && /^NOT$/i.test(peek())) { i++; return { op: 'not', a: not() }; }
    return atom();
  }
  function atom() {
    const t = tokens[i++];
    if (t == null) throw new Error('The rule ends too soon');
    if (t === '(') { const e = expr(); if (tokens[i++] !== ')') throw new Error('A bracket isn’t closed'); return e; }
    if (t === ')' || word(t)) throw new Error(`“${t}” is in the wrong place`);
    const f = t.match(/^([a-z]+)(:|>=|<=|=|>|<)(.*)$/i);
    const unq = (v) => v.replace(/^"|"$/g, '');
    if (f) return { field: f[1].toLowerCase(), cmp: f[2], value: unq(f[3]) };
    return { field: 'text', cmp: ':', value: unq(t) };
  }
  if (!tokens.length) return { all: true };
  const tree = expr();
  if (i < tokens.length) throw new Error(`“${tokens[i]}” is in the wrong place`);
  return { tree };
}

const NONE = '\u0000none';

/** The facts about an item that rules look at. */
export function factsOf(lib, bib, itemId) {
  const item = lib.items[itemId];
  const m = item?.meta ?? {};
  const a = bib.annotations?.[itemId];
  const cells = bib.lexicon?.cells?.[itemId] ?? {};
  const terms = Object.entries(cells).filter(([, v]) => v > 0).map(([id]) => bib.lexicon.terms[id]).filter(Boolean);
  return {
    item, a,
    tags: (a?.tags ?? []).concat(item?.tags ?? []).map((t) => t.toLowerCase()),
    terms: terms.map((t) => t.label.toLowerCase()),
    facets: terms.map((t) => bib.lexicon.facets[t.facetId]?.name.toLowerCase()).filter(Boolean),
    type: m.type ?? 'document',
    year: +yearOf(m.issued) || 0,
    authors: (m.creators ?? []).map((c) => (c.literal ?? `${c.given ?? ''} ${c.family ?? ''}`).toLowerCase()),
    folder: lib.folders[item?.folderId]?.name.toLowerCase() ?? '',
    format: item ? formatLabel(item).toLowerCase() : '',
    words: wordCount(a?.text),
    text: `${m.title ?? ''} ${m.abstract ?? ''} ${a?.text ?? ''}`.toLowerCase(),
  };
}

const compare = (x, cmp, v) => {
  const range = String(v).match(/^(\d+)\.\.(\d+)$/);
  if (range) return x >= +range[1] && x <= +range[2];
  const n = +v;
  return { ':': x === n, '=': x === n, '>': x > n, '<': x < n, '>=': x >= n, '<=': x <= n }[cmp];
};
function test(node, f) {
  if (node.op === 'and') return test(node.a, f) && test(node.b, f);
  if (node.op === 'or') return test(node.a, f) || test(node.b, f);
  if (node.op === 'not') return !test(node.a, f);
  const v = node.value.toLowerCase();
  switch (node.field) {
    case 'tag': return f.tags.includes(v);
    case 'term': return f.terms.includes(v);
    case 'facet': return f.facets.includes(v);
    case 'type': return f.type === v || typeOf(f.type).label.toLowerCase() === v;
    case 'year': return compare(f.year, node.cmp, v);
    case 'words': return compare(f.words, node.cmp, v);
    case 'author': return f.authors.some((a) => a.includes(v));
    case 'folder': return f.folder === v;
    case 'format': return f.format.includes(v);
    case 'has': return v === 'annotation' ? f.words > 0 : v === 'file' ? !!f.item?.file : v === 'tags' ? f.tags.length > 0 : false;
    default: return f.text.includes(v);
  }
}

/**
 * Sort a bibliography's items into groups by its rules, in order. An item
 * can be in more than one filter group; "Everything else" holds the rest.
 * → [{ id, name, rule, itemIds, error? }]
 */
export function groupItems(lib, bib) {
  const ids = bib.itemIds.filter((id) => lib.items[id]);
  const facts = Object.fromEntries(ids.map((id) => [id, factsOf(lib, bib, id)]));
  const out = [];
  const placed = new Set();
  for (const g of bib.groups ?? []) {
    let rule;
    try { rule = parseRule(g.rule); } catch (err) { out.push({ ...g, itemIds: [], error: err.message }); continue; }
    if (rule.by) {
      const buckets = new Map();
      for (const id of ids) {
        const f = facts[id];
        const keys = {
          tag: f.tags, year: [f.year || 'No date'], decade: [f.year ? `${Math.floor(f.year / 10) * 10}s` : 'No date'],
          type: [typeOf(f.type).label], author: f.authors.slice(0, 1).map((a) => a.split(' ').pop()), folder: [f.folder || 'No folder'], format: [f.format],
          facet: Object.entries(bib.lexicon.cells[id] ?? {}).filter(([, v]) => v > 0).map(([t]) => bib.lexicon.terms[t]).filter((t) => t && (!rule.facet || bib.lexicon.facets[t.facetId]?.name.toLowerCase() === rule.facet.toLowerCase())).map((t) => t.label),
        }[rule.by] ?? [];
        for (const k of keys.length ? keys : [NONE]) { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(id); placed.add(id); }
      }
      const none = `No ${rule.by === 'facet' ? `${rule.facet ?? 'lexicon'} term` : rule.by}`;
      for (const [k0, list] of [...buckets].sort((a, b) => (a[0] === NONE) - (b[0] === NONE) || String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))) {
        const k = k0 === NONE ? none : k0;
        out.push({ id: `${g.id}:${k}`, name: `${g.name ? `${g.name}: ` : ''}${String(k).replace(/^\w/, (c) => c.toUpperCase())}`, rule: g.rule, itemIds: list, facet: true });
      }
      continue;
    }
    const list = rule.all ? ids : ids.filter((id) => test(rule.tree, facts[id]));
    list.forEach((id) => placed.add(id));
    out.push({ ...g, itemIds: list });
  }
  const rest = ids.filter((id) => !placed.has(id));
  if (rest.length || !out.length) out.push({ id: 'rest', name: out.length ? 'Everything else' : 'All items', rule: '', itemIds: rest });
  return out;
}

/* ---------- Weekly brief and newsletter ---------- */

/** Annotations written or changed in a week, newest first. */
export const weekAnnotations = (lib, bib, week) => Object.entries(bib.annotations ?? {})
  .filter(([id, a]) => bib.itemIds.includes(id) && lib.items[id] && a.updatedAt && weekKey(new Date(a.updatedAt)) === week)
  .sort((x, y) => y[1].updatedAt - x[1].updatedAt)
  .map(([id, a]) => ({ item: lib.items[id], annotation: a }));

/**
 * A first draft of the week's policy brief and state-of-play paragraph from
 * its annotations: which themes came up, and which sources said so. A
 * scaffold for a person to rewrite, not a finished brief.
 */
export function draftBrief(lib, bib, week, { framework = 'themes' } = {}) {
  const notes = weekAnnotations(lib, bib, week);
  const map = tagMap(bib, { week });
  const cite = (it) => apaCitation(it.meta);
  if (!notes.length) return { policy: '', stateOfPlay: '', recommendations: '' };
  const model = frameworksFor(bib).find((f) => f.id === framework) ?? FRAMEWORKS[0];
  const finding = (n) => `${firstSentence(n.annotation.text)} ${cite(n.item)}`;
  let sections;
  if (model.categories) {
    const under = (cat) => notes.filter((n) => categoriesOf(lib, bib, n.item.id, [cat]).length);
    const placed = new Set();
    sections = model.categories.map((cat) => {
      const list = under(cat);
      list.forEach((n) => placed.add(n.item.id));
      return `### ${cat}\n\n${list.length ? list.map((n) => `- ${finding(n)}`).join('\n') : '- *Nothing this week. Is that a gap?*'}`;
    });
    const rest = notes.filter((n) => !placed.has(n.item.id));
    if (rest.length) sections.push(`### Not yet placed\n\n${rest.map((n) => `- ${finding(n)}`).join('\n')}\n\n*Tag these with a ${model.label} category to place them.*`);
  } else {
    const theme = (t) => notes.filter((n) => (n.annotation.tags ?? []).includes(t.tag));
    sections = map.tags.slice(0, 4).map((t) => `- **${t.tag}**: ${theme(t).map(finding).join(' ')}`);
  }
  const policy = [
    `## Purpose\n\nThis brief draws on ${notes.length} source${notes.length === 1 ? '' : 's'} annotated in the week of ${weekLabel(week)} for *${bib.title}*${model.categories ? `, laid out by ${model.label}` : ''}.`,
    model.categories ? `## Findings by ${model.label}` : '## Key findings',
    ...sections,
    '## Implications for policy\n\n- *What should change, and who can change it?*\n- *What is still uncertain?*',
  ].join('\n\n');
  const top = map.tags.slice(0, 4);
  const stateOfPlay = `This week ${notes.length} new source${notes.length === 1 ? ' was' : 's were'} added to ${bib.title}. `
    + (top.length ? `The conversation centred on ${listWords(top.map((t) => t.tag))}${map.pairs[0] ? `, with ${map.pairs[0].a} and ${map.pairs[0].b} most often discussed together` : ''}. ` : '')
    + `The newest evidence includes ${listWords(notes.slice(0, 3).map((n) => `${n.item.meta.title} ${cite(n.item)}`))}.`;
  const recommendations = '1. *The first thing to do, by whom, by when.*\n2. *The next.*\n3. *What to watch for next week.*';
  return { policy, stateOfPlay, recommendations, framework: model.id };
}

/** The week's sources as a list of resources: links, files and Dashi docs, with where to find each. */
export function weekResources(lib, bib, week) {
  return weekAnnotations(lib, bib, week).map(({ item }) => ({
    id: item.id, title: item.meta.title || 'Untitled', cite: apaCitation(item.meta),
    kind: isMapFile(item) ? 'Ecosystem map' : item.kind === 'doc' ? 'Dashi doc' : item.kind === 'file' ? formatLabel(item) : item.kind === 'gdoc' ? 'Google file' : item.kind === 'link' ? 'Web page' : 'Reference',
    url: item.url || item.meta.URL || (item.meta.DOI ? `https://doi.org/${item.meta.DOI}` : ''),
  }));
}

/** The sentence of an annotation most likely to carry its finding. */
const firstSentence = (s) => {
  const sentences = String(s ?? '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) ?? [String(s ?? '').slice(0, 160)];
  return (sentences.find((x) => /\b(finding|finds|found|suggests?|shows?|concludes?|argues?)\b/i.test(x)) ?? sentences[0]).trim();
};
const listWords = (xs) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/**
 * The weekly newsletter as Markdown: the state of play, the policy brief,
 * the week's annotations, the tag map and the references.
 */
export function newsletter(lib, bib, week, { orgName = '' } = {}) {
  const w = bib.weeks?.[week] ?? {};
  const notes = weekAnnotations(lib, bib, week);
  const map = tagMap(bib, { week });
  const parts = [
    `# ${bib.title}: the week of ${weekLabel(week)}`,
    orgName && `*${orgName}*`,
    '## State of play',
    w.stateOfPlay?.trim() || '_No state-of-play paragraph this week._',
    '## Policy brief',
    w.policy?.trim() || '_No policy brief this week._',
    w.recommendations?.trim() && '## Recommendations',
    w.recommendations?.trim(),
    '## Resources',
    weekResources(lib, bib, week).map((r) => `- ${r.url ? `[${r.title}](${r.url})` : r.title} ${r.cite} · ${r.kind}`).join('\n') || '_None this week._',
    `## This week’s annotations (${notes.length})`,
    ...notes.map(({ item, annotation }) => `### ${item.meta.title || 'Untitled'}\n\n${runsToMarkdown(apaReference(item.meta))}\n\n${annotation.text?.trim() ?? ''}${annotation.tags?.length ? `\n\n*Tags: ${annotation.tags.join(', ')}*` : ''}`),
    '## Tag map',
    map.tags.length ? map.tags.map((t) => `- **${t.tag}** (${t.n})${map.pairs.filter((p) => p.a === t.tag || p.b === t.tag).slice(0, 3).map((p, i) => `${i ? ',' : ' with'} ${p.a === t.tag ? p.b : p.a}`).join('')}`).join('\n') : '_No tags this week._',
    '## References',
    apaList(notes.map((n) => n.item.meta)).map((r) => runsToMarkdown(r)).join('\n\n') || '_None._',
  ];
  return parts.filter(Boolean).join('\n\n') + '\n';
}

/** Items in no bibliography's way: a quick text search over the library. */
export function searchItems(lib, text) {
  const t = String(text ?? '').trim().toLowerCase();
  const all = Object.values(lib.items);
  if (!t) return all;
  return all.filter((it) => `${it.meta.title} ${(it.meta.creators ?? []).map(fullName).join(' ')} ${it.meta.abstract ?? ''} ${(it.tags ?? []).join(' ')} ${it.meta.containerTitle ?? ''} ${yearOf(it.meta.issued)}`.toLowerCase().includes(t));
}

/* ---------- Matching uploaded files to references ---------- */

/** Every DOI written in some text (PDF metadata, a cover page, a text file), in order. */
export function doisIn(text) {
  const out = [];
  for (const m of String(text ?? '').matchAll(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/g)) {
    let d = m[0];
    // Stop at a bracket that closes nothing: PDF strings end with ")".
    let depth = 0;
    for (let i = 0; i < d.length; i++) { if (d[i] === '(') depth++; else if (d[i] === ')' && --depth < 0) { d = d.slice(0, i); break; } }
    d = d.replace(/[.;,:/]+$/, '').toLowerCase();
    if (!out.includes(d)) out.push(d);
  }
  return out;
}
const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
const words = (s) => new Set(String(s ?? '').toLowerCase().normalize('NFKD').split(/[^a-z0-9]+/).filter((w) => w.length > 2));
/**
 * What a file says about itself: DOIs inside it or in its name, an ISBN in
 * its name, its name, and the start of its text (`text` is whatever could be
 * read: the raw bytes of a PDF hold its metadata; extracted text is better).
 */
export function fileHints(name, text = '') {
  const stem = String(name).replace(/\.[a-z0-9]+(\.txt)?$/i, '').replace(/\s*\(\d+\)$/, '').replace(/[ _]1$/, '');
  const fromName = stem.match(/^(10\.\d{4,9})_(.+)$/);
  const dois = [...(fromName ? [`${fromName[1]}/${fromName[2]}`.toLowerCase()] : []), ...doisIn(text)];
  const isbn = stem.match(/97[89][-\d]{10,16}\d/)?.[0] ?? '';
  return { dois, isbn, stem, head: norm(String(text).slice(0, 6000)) };
}
/**
 * The library item a file belongs to, among items with no file yet: one with
 * a DOI found in the file; a DOI or ISBN holding the ISBN in the file's name;
 * a title equal to the file's name (Zotero keeps a file's name as the title
 * when it finds nothing better); a title most of whose words are in the
 * name; or a title the file's text starts with.
 */
export function matchReference(items, { dois = [], isbn = '', stem = '', head = '' }, { withFiles = false } = {}) {
  const open = Object.values(items).filter((i) => (withFiles || !i.file) && ['ref', 'link', 'file'].includes(i.kind));
  for (const d of dois) { const hit = open.find((i) => i.meta.DOI?.toLowerCase() === d); if (hit) return hit; }
  if (isbn) {
    const n = isbn.replace(/-/g, '');
    const hit = open.find((i) => (i.meta.DOI ?? '').includes(isbn) || (i.meta.ISBN ?? '').replace(/-/g, '').split(/\s+/).includes(n));
    if (hit) return hit;
  }
  const s = norm(stem);
  if (s.length >= 6) {
    const hit = open.find((i) => norm(i.meta.title) === s);
    if (hit) return hit;
  }
  const w = words(stem);
  if (w.size >= 3) {
    let best = null; let score = 0;
    for (const i of open) {
      const t = words(i.meta.title);
      if (t.size < 3) continue;
      const shared = [...t].filter((x) => w.has(x)).length / Math.min(t.size, w.size);
      if (shared > score) { score = shared; best = i; }
    }
    if (score >= 0.75) return best;
  }
  if (head) {
    // The longest title found near the start of the text, ignoring a subtitle.
    let best = null;
    for (const i of open) {
      const t = norm(String(i.meta.title ?? '').split(/[:?]/)[0]);
      if (t.length >= 18 && head.includes(t) && (!best || t.length > best.t.length)) best = { i, t };
    }
    if (best) return best.i;
  }
  return null;
}

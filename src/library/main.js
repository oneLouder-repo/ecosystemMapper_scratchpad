import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Shell, Avatar, toast } from '../ui/Shell.js';
import { SideNav, swapSide } from '../ui/SideNav.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp, col } from '../core/collections.js';
import { uid } from '../core/ops.js';
import { autosaveDoc } from '../platform/storage.js';
import { loadOrg, loadLibrary } from '../platform/docs.js';
import { currentUser } from '../platform/session.js';
import { putMedia, deleteMedia, mediaUrl, maxUploadMb } from '../platform/media.js';
import {
  TYPES, FIELDS, ROLES, typeOf, blankMeta, blankBib, migrateBib, extOf, FILE_KINDS, ACCEPT, formatLabel, titleFromName,
  apaReference, apaCitation, runsToHtml, runsToText, runsToMarkdown, dublinCore, parseReferences, wordCount, annotationLength,
  weekKey, weekLabel, shiftWeek, tagMap, allowedTags, parseRule, groupItems, weekAnnotations, draftBrief, newsletter,
  searchItems, fullName, yearOf, sortKey, apaList, fileHints, matchReference,
} from '../platform/library.js';
import { FORMATS, download, fileName, renderMarkdown, exportDoc, printHtml, exportDublinCore, exportCsl, referenceBlocks, byline } from './exports.js';
import { parseMarkdown, toHtml } from '../core/markdown.js';
import { dashiToolbarItems } from './DashiTools.js';

/**
 * The document library.
 *
 *   #files/<folder>        the repository: uploads, Dashi docs, links, references
 *   #item/<id>             one item: its metadata, preview, APA reference, Dublin Core
 *                          (a Dashi doc opens in the editor)
 *   #bibs                  annotated bibliographies
 *   #bib/<id>/<tab>        one bibliography: annotations, lexicon, groups, references, weekly
 *
 * Dashi docs are Markdown, edited with Toast UI Editor (WYSIWYG or Markdown),
 * and export to PDF, Word, OpenDocument, HTML and Markdown with their
 * Dublin Core metadata.
 */
const org = loadOrg();
const store = new Store(loadLibrary(), applyCollectionOp);
autosaveDoc('library', store, 300);
Shell(document.querySelector('#shell'), { current: 'library', org });
const me = currentUser(org);

const app = document.querySelector('#app');
app.classList.add('frame', 'library-app');
let side = h('nav');
const main = h('section', { class: 'palette-main library-main' });
app.replaceChildren(side, main);

const lib = () => store.doc;
const features = org.platform?.plan?.features;
const bibsAllowed = features ? !!features.bibliographies : true;
const now = () => Date.now();
const n = (count, word, plural = `${word}s`) => `${count} ${count === 1 ? word : plural}`;
const route = () => (decodeURIComponent(location.hash.slice(1)) || 'files/all').split('/');

/* Re-render on changes, except while someone is typing in the editor. */
let quiet = false;
const apply = (op, opts) => { quiet = true; try { store.apply(op, opts); } finally { quiet = false; } };
store.addEventListener('change', () => { if (!quiet) render(); });
window.addEventListener('hashchange', () => { closeEditor(); render(); main.scrollTop = 0; });

function render() {
  const [view, a, b] = route();
  drawSide(view, a);
  const scroll = main.scrollTop;
  let page;
  if (view === 'item' && lib().items[a]) page = lib().items[a].kind === 'doc' ? DocPage(lib().items[a]) : ItemPage(lib().items[a]);
  else if (view === 'bibs') page = BibList();
  else if (view === 'bib' && lib().bibs[a]) page = bibsAllowed ? BibPage(lib().bibs[a], b || 'annotations') : Upsell();
  else page = Files(a || 'all');
  main.replaceChildren(page);
  main.scrollTop = scroll;
}

function drawSide(view, a) {
  const items = Object.values(lib().items);
  const folders = Object.values(lib().folders).sort((x, y) => x.name.localeCompare(y.name));
  const count = (f) => items.filter(f).length;
  side = swapSide(side, SideNav({ label: 'Library', sections: [
    { title: 'Library', items: [
      { label: 'All documents', sub: n(items.length, 'item'), icon: 'book', href: '#files/all', on: view === 'files' && a === 'all' },
      { label: 'Dashi docs', sub: n(count((i) => i.kind === 'doc'), 'doc'), icon: 'doc', href: '#files/docs', on: view === 'files' && a === 'docs' },
      { label: 'Files', sub: n(count((i) => i.kind === 'file'), 'file'), icon: 'upload', href: '#files/uploads', on: view === 'files' && a === 'uploads' },
      { label: 'Links and references', sub: n(count((i) => ['link', 'gdoc', 'ref'].includes(i.kind)), 'item'), icon: 'link', href: '#files/links', on: view === 'files' && a === 'links' },
    ] },
    { title: 'Folders', action: { label: 'New folder', onclick: newFolder }, items: [
      ...folders.map((f) => ({ label: f.name, sub: n(count((i) => i.folderId === f.id), 'item'), icon: 'doc', href: `#files/${f.id}`, on: view === 'files' && a === f.id })),
      { label: 'Not in a folder', sub: n(count((i) => !i.folderId || !lib().folders[i.folderId]), 'item'), icon: 'doc', href: '#files/unfiled', on: view === 'files' && a === 'unfiled' },
    ] },
    { title: 'Bibliographies', action: bibsAllowed && { label: 'New bibliography', onclick: newBib }, items: bibsAllowed ? [
      ...Object.values(lib().bibs).sort((x, y) => x.title.localeCompare(y.title)).map((bib) => ({ label: bib.title, sub: `${n(bib.itemIds.length, 'source')} · ${n(Object.values(bib.annotations).filter((x) => x.text?.trim()).length, 'annotation')}`, icon: 'news', href: `#bib/${bib.id}`, on: view === 'bib' && a === bib.id })),
      { label: 'All bibliographies', icon: 'news', href: '#bibs', on: view === 'bibs' },
    ] : [{ label: 'Annotated bibliographies', sub: 'Standard and Custom plans', icon: 'lock', href: '#bibs', on: view === 'bibs' }] },
  ] }));
}

/* ---------- The repository ---------- */

let search = '';
let sort = 'updated';
// What the last upload or import said, kept across the redraw it causes.
let lastNote = '';
const say = (el, text) => { lastNote = text; if (el) el.textContent = text; };
function Files(scope) {
  const folder = lib().folders[scope];
  const scopes = {
    all: () => true,
    docs: (i) => i.kind === 'doc',
    uploads: (i) => i.kind === 'file',
    links: (i) => ['link', 'gdoc', 'ref'].includes(i.kind),
    unfiled: (i) => !i.folderId || !lib().folders[i.folderId],
  };
  const inScope = folder ? (i) => i.folderId === folder.id : scopes[scope] ?? scopes.all;
  const sorters = {
    updated: (x, y) => (y.updatedAt ?? 0) - (x.updatedAt ?? 0),
    title: (x, y) => (x.meta.title || '').localeCompare(y.meta.title || ''),
    author: (x, y) => sortKey(x.meta).localeCompare(sortKey(y.meta)),
    year: (x, y) => (yearOf(y.meta.issued) || '0').localeCompare(yearOf(x.meta.issued) || '0'),
  };
  const items = searchItems(lib(), search).filter(inScope).sort(sorters[sort]);
  const title = folder ? folder.name : { all: 'All documents', docs: 'Dashi docs', uploads: 'Files', links: 'Links and references', unfiled: 'Not in a folder' }[scope] ?? 'All documents';
  const status = h('p', { class: 'upload-status', role: 'status' }, lastNote);
  lastNote = '';
  const used = Object.values(lib().items).length;
  const limit = org.platform?.plan?.limits?.documents;

  const list = h('div', { class: 'lib-list' });
  const draw = () => {
    const rows = searchItems(lib(), search).filter(inScope).sort(sorters[sort]);
    list.replaceChildren(rows.length
      ? h('table', { class: 'lib-table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Title'), h('th', {}, 'Authors'), h('th', {}, 'Year'), h('th', {}, 'Kind'), h('th', {}, 'Tags'), h('th', { class: 'num' }, 'Size'))),
          h('tbody', {}, rows.map(Row)))
      : h('p', { class: 'empty' }, search ? 'Nothing matches that search.' : 'Nothing here yet. Upload files, write a Dashi doc, or import references from Zotero.'));
  };
  draw();

  return h('div', {},
    PluginHeader('library', { title: folder ? folder.name : undefined, blurb: folder ? 'A folder in your library.' : undefined, actions: h('div', { class: 'lib-actions' },
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => newDoc(folder?.id) }, icon('doc', 15), 'New Dashi doc'),
      UploadButton(folder?.id, status),
      h('details', { class: 'dropdown dropdown-end' },
        h('summary', { class: 'btn btn-sm' }, icon('plus', 15), 'Add'),
        h('ul', { class: 'menu dropdown-content lib-menu' },
          h('li', {}, h('button', { onclick: () => addLink(folder?.id, 'link') }, icon('link', 15), 'A web page')),
          h('li', {}, h('button', { onclick: () => addLink(folder?.id, 'gdoc') }, icon('doc', 15), 'A Google Doc, Sheet or Slides')),
          h('li', {}, h('button', { onclick: () => addReference(folder?.id) }, icon('book', 15), 'A reference (no file)')),
          h('li', {}, ImportButton(folder?.id, null, status)))),
      folder && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => renameFolder(folder) }, 'Rename folder')) }),
    h('div', { class: 'lib-toolbar' },
      h('h2', {}, title, h('span', { class: 'muted' }, ` · ${n(items.length, 'item')}`)),
      h('input', { class: 'input input-sm lib-search', type: 'search', placeholder: 'Search titles, authors, tags, abstracts', value: search, 'aria-label': 'Search the library', oninput: (e) => { search = e.target.value; draw(); } }),
      h('select', { class: 'select select-sm', 'aria-label': 'Sort by', onchange: (e) => { sort = e.target.value; draw(); } },
        options([{ id: 'updated', label: 'Newest changes' }, { id: 'title', label: 'Title' }, { id: 'author', label: 'Author' }, { id: 'year', label: 'Year' }], sort))),
    limit != null && h('p', { class: 'muted small' }, `${used} of ${limit} documents on your plan · files up to ${maxUploadMb()} MB`),
    status,
    list);
}

function Row(item) {
  const fk = FILE_KINDS[extOf(item.file?.name)];
  const kindIcon = item.kind === 'doc' ? 'doc' : item.kind === 'gdoc' ? 'doc' : item.kind === 'link' ? 'link' : item.kind === 'ref' ? 'book' : fk?.icon ?? 'doc';
  const tone = item.kind === 'doc' ? 'var(--color-primary)' : item.kind === 'gdoc' ? '#1a73e8' : fk?.tone ?? '#666';
  const authors = (item.meta.creators ?? []).filter((c) => ['author', 'host'].includes(c.role ?? 'author'));
  return h('tr', {},
    h('td', {}, h('a', { href: `#item/${item.id}`, class: 'lib-title' }, h('span', { class: 'lib-kind', style: `--kind:${tone}` }, icon(kindIcon, 16)), h('span', {}, item.meta.title || 'Untitled', item.meta.containerTitle && h('small', { class: 'muted' }, item.meta.containerTitle)))),
    h('td', { class: 'muted' }, authors.slice(0, 2).map((c) => c.literal ?? c.family).join(', ') + (authors.length > 2 ? ' et al.' : '')),
    h('td', { class: 'muted' }, yearOf(item.meta.issued) || '—'),
    h('td', {}, h('span', { class: 'badge badge-sm badge-ghost' }, formatLabel(item))),
    h('td', {}, h('div', { class: 'tag-row' }, (item.tags ?? []).slice(0, 3).map((t) => h('span', { class: 'tag' }, t)))),
    h('td', { class: 'num muted' }, item.file ? size(item.file.size) : item.kind === 'doc' ? `${wordCount(item.body)} words` : ''));
}
const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** The start and end of a file as text: where a PDF keeps its metadata and DOI. */
async function readHead(file) {
  const dec = new TextDecoder('latin1');
  const head = dec.decode(await file.slice(0, 300000).arrayBuffer());
  return file.size > 300000 ? `${head}\n${dec.decode(await file.slice(-200000).arrayBuffer())}` : head;
}
const typeForFile = (name) => ({ pdf: 'report', xlsx: 'dataset', xls: 'dataset', csv: 'dataset', ods: 'dataset', pptx: 'paper-conference', ppt: 'paper-conference', odp: 'paper-conference' }[extOf(name)] ?? 'document');

function UploadButton(folderId, status) {
  const input = h('input', { type: 'file', multiple: true, accept: ACCEPT, class: 'sr-only', 'aria-label': 'Upload files', onchange: async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    let done = 0;
    const attached = [];
    for (const file of files) {
      if (file.size > maxUploadMb() * 1048576) { say(status, `${file.name} is over ${maxUploadMb()} MB, the largest file your plan takes.`); continue; }
      say(status, `Uploading ${file.name}…`);
      try {
        const mediaId = await putMedia(file, { kind: 'document', onProgress: (p) => { say(status, `Uploading ${file.name}… ${Math.round(p * 100)}%`); } });
        const fileInfo = { mediaId, name: file.name, size: file.size, type: file.type || 'application/octet-stream' };
        // A file for a reference that's already here (from Zotero, say) is attached to it.
        const ref = matchReference(lib().items, fileHints(file.name, await readHead(file)));
        if (ref) {
          apply(col.update('items', ref.id, { kind: 'file', file: fileInfo, updatedAt: now() }));
          attached.push(ref.meta.title);
          done++;
          continue;
        }
        apply(col.add('items', {
          id: uid('doc'), kind: 'file', folderId: folderId ?? null, tags: [],
          meta: blankMeta({ type: typeForFile(file.name), title: titleFromName(file.name), creators: me ? [] : [] }),
          file: fileInfo,
          createdAt: now(), updatedAt: now(), createdBy: me?.id ?? null,
        }));
        done++;
      } catch (err) { say(status, `${file.name}: ${err.message}`); return; }
    }
    if (done) say(status, `Added ${n(done, 'file')}.${attached.length ? ` ${attached.length === 1 ? `Attached to its reference: “${attached[0]}”.` : `${attached.length} were attached to their references.`}` : ''} Open one to fill in its details.`);
    render();
  } });
  return h('label', { class: 'btn btn-sm' }, icon('upload', 15), 'Upload files', input);
}

/** Import references (CSL JSON from Zotero, BibTeX, RIS) as items, optionally into a bibliography. */
function ImportButton(folderId, bib, status) {
  const input = h('input', { type: 'file', accept: '.json,.bib,.ris,.txt', class: 'sr-only', 'aria-label': 'Import references', onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const metas = parseReferences(await file.text(), file.name);
      // Skip what is already in the library (same DOI, or same title and year).
      const seen = new Set(Object.values(lib().items).map((i) => (i.meta.DOI ? `doi:${i.meta.DOI.toLowerCase()}` : `t:${(i.meta.title || '').toLowerCase()}|${yearOf(i.meta.issued)}`)));
      const ops = [];
      const ids = [];
      let skipped = 0;
      for (const meta of metas) {
        const key = meta.DOI ? `doi:${meta.DOI.toLowerCase()}` : `t:${(meta.title || '').toLowerCase()}|${yearOf(meta.issued)}`;
        if (seen.has(key)) {
          skipped++;
          const existing = Object.values(lib().items).find((i) => (i.meta.DOI ? `doi:${i.meta.DOI.toLowerCase()}` : `t:${(i.meta.title || '').toLowerCase()}|${yearOf(i.meta.issued)}`) === key);
          if (existing) ids.push(existing.id);
          continue;
        }
        seen.add(key);
        const id = uid('doc');
        ids.push(id);
        ops.push(col.add('items', { id, kind: meta.URL ? 'link' : 'ref', url: meta.URL ?? '', folderId: folderId ?? null, tags: [], meta, createdAt: now(), updatedAt: now(), createdBy: me?.id ?? null }));
      }
      if (bib) ops.push(col.update('bibs', bib.id, { itemIds: [...new Set([...bib.itemIds, ...ids])] }));
      if (ops.length) apply(col.batch(ops));
      const msg = `Imported ${n(metas.length - skipped, 'reference')}${skipped ? ` (${skipped} already in the library${bib ? ', added to this bibliography' : ''})` : ''}.`;
      if (status) say(status, msg); else toast(msg);
      render();
    } catch (err) {
      const msg = `Couldn’t read ${file.name}: ${err.message}`;
      if (status) say(status, msg); else alert(msg);
    }
  } });
  return h('label', { class: bib ? 'btn btn-sm' : '' }, icon('book', 15), bib ? 'Import references' : 'Import references (Zotero CSL JSON, BibTeX, RIS)', input);
}

function newDoc(folderId) {
  const title = prompt('Title of the new doc', 'Untitled doc');
  if (title == null) return;
  const id = uid('doc');
  apply(col.add('items', {
    id, kind: 'doc', folderId: folderId ?? null, tags: [],
    meta: blankMeta({ type: 'manuscript', title: title.trim() || 'Untitled doc', creators: me ? [nameOf(me)] : [], issued: new Date().toISOString().slice(0, 10), publisher: org.name }),
    body: `# ${title.trim() || 'Untitled doc'}\n\n`, createdAt: now(), updatedAt: now(), createdBy: me?.id ?? null,
  }));
  location.hash = `item/${id}`;
}
const nameOf = (person) => {
  const parts = person.name.trim().split(/\s+/);
  return { role: 'author', family: parts.at(-1), given: parts.slice(0, -1).join(' ') };
};

function addLink(folderId, kind) {
  const url = prompt(kind === 'gdoc' ? 'Paste the Google Doc, Sheet or Slides address (share it with your team in Google first)' : 'Web address');
  if (!url?.trim()) return;
  if (!/^https?:\/\//i.test(url.trim())) { alert('That isn’t a web address. It should start with https://'); return; }
  if (kind === 'gdoc' && !/^https:\/\/(docs|drive)\.google\.com\//.test(url.trim())) { alert('That isn’t a Google Docs or Drive address.'); return; }
  const title = prompt('Title', '') ?? '';
  const id = uid('doc');
  apply(col.add('items', { id, kind, url: url.trim(), folderId: folderId ?? null, tags: [], meta: blankMeta({ type: kind === 'gdoc' ? 'manuscript' : 'webpage', title: title.trim() || url.trim(), URL: url.trim(), accessed: new Date().toISOString().slice(0, 10) }), createdAt: now(), updatedAt: now(), createdBy: me?.id ?? null }));
  location.hash = `item/${id}`;
}

function addReference(folderId) {
  const id = uid('doc');
  apply(col.add('items', { id, kind: 'ref', folderId: folderId ?? null, tags: [], meta: blankMeta({ type: 'article-journal', title: '' }), createdAt: now(), updatedAt: now(), createdBy: me?.id ?? null }));
  location.hash = `item/${id}`;
}

function newFolder() {
  const name = prompt('Name of the new folder');
  if (!name?.trim()) return;
  const id = uid('folder');
  apply(col.add('folders', { id, name: name.trim(), parentId: null }));
  location.hash = `files/${id}`;
}
function renameFolder(f) {
  const name = prompt('Folder name', f.name);
  if (!name?.trim()) return;
  store.apply(col.update('folders', f.id, { name: name.trim() }));
}

/* ---------- One item ---------- */

const touch = (item, patch) => apply(col.update('items', item.id, { ...patch, updatedAt: now() }));
const setMeta = (item, patch) => touch(item, { meta: { ...item.meta, ...patch } });

function ItemPage(item) {
  const preview = h('div', { class: 'lib-preview' });
  fillPreview(item, preview);
  return h('div', { class: 'item-page' },
    h('nav', { class: 'crumbs' }, h('a', { href: '#files/all' }, 'Library'), ' / ', item.folderId && lib().folders[item.folderId] ? [h('a', { href: `#files/${item.folderId}` }, lib().folders[item.folderId].name), ' / '] : null, h('span', {}, formatLabel(item))),
    h('div', { class: 'item-head' },
      h('input', { class: 'title-input', value: item.meta.title, placeholder: 'Title', 'aria-label': 'Title', onchange: (e) => { setMeta(item, { title: e.target.value }); render(); } }),
      h('div', { class: 'item-actions' },
        item.file && h('button', { class: 'btn btn-sm btn-primary', onclick: async () => openMedia(item, false) }, icon('globe', 14), 'Open'),
        item.file && h('button', { class: 'btn btn-sm', onclick: async () => openMedia(item, true) }, icon('download', 14), 'Download'),
        item.url && h('a', { class: 'btn btn-sm btn-primary', href: item.url, target: '_blank', rel: 'noopener noreferrer' }, icon('globe', 14), item.kind === 'gdoc' ? `Open in ${formatLabel(item).replace('Google ', 'Google ')}` : 'Open page'),
        h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: () => removeItem(item) }, icon('trash', 14), 'Delete'))),
    h('div', { class: 'item-grid' },
      h('div', {}, preview, Citation(item), InBibs(item), DublinCore(item)),
      h('div', {}, MetaForm(item))));
}

async function openMedia(item, asDownload) {
  const url = await mediaUrl(item.file.mediaId);
  if (!url) { alert('That file is no longer stored.'); return; }
  if (asDownload) { const a = h('a', { href: url.startsWith('blob:') ? url : `${url}?download`, download: item.file.name }); document.body.append(a); a.click(); a.remove(); } else window.open(url, '_blank', 'noopener');
}

async function fillPreview(item, el) {
  if (item.kind === 'gdoc' || item.kind === 'link') {
    el.replaceChildren(h('div', { class: 'link-card' }, icon(item.kind === 'gdoc' ? 'doc' : 'link', 28), h('div', {}, h('strong', {}, formatLabel(item)), h('a', { href: item.url, target: '_blank', rel: 'noopener noreferrer' }, item.url),
      item.kind === 'gdoc' && h('p', { class: 'muted small' }, 'Google files stay in Google Drive. Anyone opening this link needs access there.'))));
    return;
  }
  if (item.kind === 'ref') { el.replaceChildren(h('div', { class: 'link-card' }, icon('book', 28), h('div', {}, h('strong', {}, 'A reference'), h('p', { class: 'muted small' }, 'No file attached. Upload one to keep the document with its reference.'), AttachButton(item)))); return; }
  if (!item.file) return;
  const url = await mediaUrl(item.file.mediaId);
  const ext = extOf(item.file.name);
  const fk = FILE_KINDS[ext];
  if (!url) { el.replaceChildren(h('p', { class: 'empty' }, 'This file is no longer stored on this computer.')); return; }
  if (ext === 'pdf') el.replaceChildren(h('iframe', { class: 'pdf-frame', src: url, title: item.meta.title }));
  else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) el.replaceChildren(h('img', { class: 'img-preview', src: url, alt: item.meta.title }));
  else if (['txt', 'md', 'csv', 'json', 'bib', 'ris'].includes(ext)) {
    const text = await (await fetch(url)).text().catch(() => '');
    el.replaceChildren(h('pre', { class: 'text-preview' }, text.slice(0, 20000)));
  } else {
    el.replaceChildren(h('div', { class: 'link-card file-card', style: `--kind:${fk?.tone ?? '#666'}` }, icon(fk?.icon ?? 'doc', 32),
      h('div', {}, h('strong', {}, item.file.name), h('span', { class: 'muted' }, `${fk?.label ?? 'File'} · ${size(item.file.size)}`), h('p', { class: 'muted small' }, 'Open it in Word, Excel, PowerPoint or LibreOffice with Download.'))));
  }
}

function AttachButton(item) {
  const input = h('input', { type: 'file', accept: ACCEPT, class: 'sr-only', 'aria-label': 'Attach a file', onchange: async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const mediaId = await putMedia(file, { kind: 'document' });
      touch(item, { kind: 'file', file: { mediaId, name: file.name, size: file.size, type: file.type } });
      render();
    } catch (err) { alert(err.message); }
  } });
  return h('label', { class: 'btn btn-sm' }, icon('upload', 14), 'Attach a file', input);
}

function removeItem(item) {
  const inBibs = Object.values(lib().bibs).filter((b) => b.itemIds.includes(item.id));
  if (!confirm(`Delete “${item.meta.title || 'Untitled'}”?${inBibs.length ? ` It is in ${n(inBibs.length, 'bibliography', 'bibliographies')}, and its annotations there go too.` : ''}`)) return;
  apply(col.batch([
    ...inBibs.map((b) => { const annotations = { ...b.annotations }; delete annotations[item.id]; return col.update('bibs', b.id, { itemIds: b.itemIds.filter((x) => x !== item.id), annotations }); }),
    col.remove('items', item.id),
  ]));
  if (item.file?.mediaId) deleteMedia(item.file.mediaId);
  location.hash = 'files/all';
}

function Citation(item) {
  const ref = apaReference(item.meta);
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast('Copied'), () => {});
  return h('section', { class: 'card cite-card' },
    h('h3', {}, 'APA 7 reference'),
    h('p', { class: 'reference', innerHTML: runsToHtml(ref) }),
    h('p', { class: 'muted small' }, 'In the text: ', h('code', {}, apaCitation(item.meta)), ' or ', h('code', {}, apaCitation(item.meta, { narrative: true }))),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-xs', onclick: () => copy(runsToText(ref)) }, 'Copy reference'),
      h('button', { class: 'btn btn-xs', onclick: () => exportCsl([item], item.meta.title) }, 'CSL JSON'),
      h('button', { class: 'btn btn-xs', onclick: () => exportDublinCore(item) }, 'Dublin Core XML')));
}

function InBibs(item) {
  const bibs = Object.values(lib().bibs);
  if (!bibsAllowed || !bibs.length) return null;
  return h('section', { class: 'card' },
    h('h3', {}, 'In bibliographies'),
    h('div', { class: 'check-list' }, bibs.map((b) => h('label', { class: 'check' },
      h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: b.itemIds.includes(item.id), onchange: (e) => apply(col.update('bibs', b.id, { itemIds: e.target.checked ? [...b.itemIds, item.id] : b.itemIds.filter((x) => x !== item.id) })) }),
      h('a', { href: `#bib/${b.id}` }, b.title)))));
}

function DublinCore(item) {
  const dc = dublinCore(item);
  return h('details', { class: 'card dc-card' },
    h('summary', {}, h('strong', {}, 'Dublin Core record'), h('span', { class: 'muted small' }, ' · the fifteen elements, made from the details')),
    h('table', { class: 'dc-table' }, h('tbody', {}, Object.entries(dc).map(([k, v]) => h('tr', {}, h('th', {}, `dc:${k}`), h('td', {}, Array.isArray(v) ? v.join('; ') || '—' : v || '—'))))));
}

/** The metadata form: the item's type decides which fields show. */
function MetaForm(item) {
  const m = item.meta;
  const t = typeOf(m.type);
  const field = (key, { area = false, type = 'text' } = {}) => h('label', { class: 'field' },
    h('span', {}, FIELDS[key].label),
    area
      ? h('textarea', { class: 'textarea textarea-sm', rows: 4, name: key, onchange: (e) => setMeta(item, { [key]: e.target.value }) }, m[key] ?? '')
      : h('input', { class: 'input input-sm', type, name: key, value: m[key] ?? '', placeholder: FIELDS[key].date ? 'YYYY, YYYY-MM or YYYY-MM-DD' : '', onchange: (e) => { setMeta(item, { [key]: e.target.value.trim() }); render(); } }));
  return h('section', { class: 'card meta-card' },
    h('h3', {}, 'Details'),
    h('label', { class: 'field' }, h('span', {}, 'Kind of work'),
      h('select', { class: 'select select-sm', onchange: (e) => { setMeta(item, { type: e.target.value }); render(); } }, options(TYPES.map((x) => ({ id: x.id, label: x.label })), m.type))),
    Creators(item),
    field('issued'),
    t.fields.map((k) => field(k, { type: FIELDS[k].date ? 'text' : 'text' })),
    field('abstract', { area: true }),
    h('label', { class: 'field' }, h('span', {}, 'Keywords (subjects), separated by commas'),
      h('input', { class: 'input input-sm', value: (m.keywords ?? []).join(', '), onchange: (e) => setMeta(item, { keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }) })),
    h('div', { class: 'field-row' }, field('language'), field('rights')),
    h('hr'),
    h('label', { class: 'field' }, h('span', {}, 'Folder'),
      h('select', { class: 'select select-sm', onchange: (e) => { touch(item, { folderId: e.target.value || null }); render(); } },
        h('option', { value: '' }, 'Not in a folder'), options(Object.values(lib().folders).map((f) => ({ id: f.id, label: f.name })), item.folderId))),
    TagInput(item.tags ?? [], (tags) => { touch(item, { tags }); render(); }, { label: 'Library tags' }),
    field('note', { area: true }));
}

function Creators(item) {
  const list = item.meta.creators ?? [];
  const set = (creators) => { setMeta(item, { creators }); render(); };
  return h('fieldset', { class: 'creators' },
    h('legend', {}, 'Authors and other contributors'),
    list.map((c, i) => h('div', { class: 'creator-row' },
      h('select', { class: 'select select-xs', 'aria-label': 'Role', onchange: (e) => set(list.map((x, j) => (j === i ? { ...x, role: e.target.value } : x))) }, options(ROLES.map((r) => ({ id: r, label: r[0].toUpperCase() + r.slice(1) })), c.role ?? 'author')),
      c.literal != null
        ? h('input', { class: 'input input-xs grow', value: c.literal, placeholder: 'Organisation', 'aria-label': 'Organisation name', onchange: (e) => set(list.map((x, j) => (j === i ? { role: x.role, literal: e.target.value } : x))) })
        : [h('input', { class: 'input input-xs', value: c.family ?? '', placeholder: 'Family name', 'aria-label': 'Family name', onchange: (e) => set(list.map((x, j) => (j === i ? { ...x, family: e.target.value } : x))) }),
          h('input', { class: 'input input-xs', value: c.given ?? '', placeholder: 'Given names', 'aria-label': 'Given names', onchange: (e) => set(list.map((x, j) => (j === i ? { ...x, given: e.target.value } : x))) })],
      h('button', { class: 'icon-button', title: 'Move up', 'aria-label': 'Move up', disabled: i === 0, onclick: () => { const next = [...list]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; set(next); } }, '↑'),
      h('button', { class: 'icon-button', 'aria-label': 'Remove', onclick: () => set(list.filter((_, j) => j !== i)) }, '×'))),
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn btn-xs', onclick: () => set([...list, { role: 'author', family: '', given: '' }]) }, '+ Person'),
      h('button', { class: 'btn btn-xs', onclick: () => set([...list, { role: 'author', literal: '' }]) }, '+ Organisation')));
}

/** Tags as chips, with an input to add more (from a fixed list when `allowed` is given). */
function TagInput(tags, onChange, { label = 'Tags', allowed = null, suggestions = [] } = {}) {
  const listId = `tags-${Math.random().toString(36).slice(2, 8)}`;
  const add = (v) => {
    const t = v.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    if (allowed && !allowed.map((a) => a.toLowerCase()).includes(t)) { toast(`“${t}” isn’t in this bibliography’s lexicon`, 'error'); return; }
    onChange([...tags, t]);
  };
  const input = allowed
    ? h('select', { class: 'select select-xs', 'aria-label': `Add to ${label}`, onchange: (e) => { if (e.target.value) add(e.target.value); } }, h('option', { value: '' }, '+ Term'), allowed.filter((a) => !tags.includes(a.toLowerCase())).map((a) => h('option', { value: a }, a)))
    : h('input', { class: 'input input-xs tag-add', placeholder: '+ tag', list: listId, 'aria-label': `Add to ${label}`, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(e.target.value); } }, onchange: (e) => add(e.target.value) });
  return h('div', { class: 'field' },
    h('span', {}, label),
    h('div', { class: 'tag-row editable' },
      tags.map((t) => h('span', { class: 'tag' }, t, h('button', { 'aria-label': `Remove ${t}`, onclick: () => onChange(tags.filter((x) => x !== t)) }, '×'))),
      input,
      !allowed && h('datalist', { id: listId }, suggestions.filter((s) => !tags.includes(s)).map((s) => h('option', { value: s })))));
}

/* ---------- Dashi docs: the editor ---------- */

let editor = null;
let editorFor = null;
function closeEditor() {
  // Keep what was typed since the last save.
  const item = editorFor && lib().items[editorFor];
  if (editor && item) { const body = editor.getMarkdown(); if (body !== item.body) apply(col.update('items', item.id, { body, updatedAt: now() })); }
  if (editor) { try { editor.destroy(); } catch { /* gone */ } }
  editor = null;
  editorFor = null;
}

function DocPage(item) {
  const host = h('div', { class: 'doc-editor' });
  const words = h('span', { class: 'muted small' }, `${wordCount(item.body)} words`);
  let timer;
  const save = () => {
    const body = editor?.getMarkdown() ?? item.body;
    const current = lib().items[item.id];
    if (!current || body === current.body) return;
    const h1 = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
    touch(current, { body, ...(h1 && h1 !== current.meta.title && current.meta.title === (current.body.match(/^#\s+(.+)$/m)?.[1]?.trim()) ? { meta: { ...current.meta, title: h1 } } : {}) });
  };
  const mount = () => {
    closeEditor();
    if (!window.toastui?.Editor) { host.replaceChildren(h('textarea', { class: 'textarea doc-fallback', onchange: (e) => touch(item, { body: e.target.value }) }, item.body)); return; }
    editor = new window.toastui.Editor({
      el: host,
      height: '100%',
      initialEditType: localStorage.getItem('dashi.doc-mode') === 'markdown' ? 'markdown' : 'wysiwyg',
      previewStyle: 'tab',
      initialValue: item.body ?? '',
      usageStatistics: false,
      autofocus: false,
      placeholder: 'Write here. The toolbar has headings, lists, tables, links and quotes.',
      toolbarItems: [['heading', 'bold', 'italic', 'strike'], dashiToolbarItems(() => editor), ['ul', 'ol', 'task'], ['table', 'link', 'image', 'quote', 'hr'], ['indent', 'outdent', 'code', 'codeblock']],
      events: {
        change: () => { words.textContent = `${wordCount(editor.getMarkdown())} words`; clearTimeout(timer); timer = setTimeout(save, 600); },
        blur: save,
        changeMode: (mode) => { try { localStorage.setItem('dashi.doc-mode', mode); } catch { /* fine */ } },
      },
    });
    editorFor = item.id;
  };
  queueMicrotask(mount);
  window.addEventListener('beforeunload', save, { once: true });

  const exportMenu = h('details', { class: 'dropdown dropdown-end' },
    h('summary', { class: 'btn btn-sm btn-primary' }, icon('download', 14), 'Export'),
    h('ul', { class: 'menu dropdown-content lib-menu' },
      FORMATS.map((f) => h('li', {}, h('button', { onclick: async (e) => { save(); e.target.closest('details').open = false; await exportDoc(lib().items[item.id], f.id); } }, `${f.label} (.${f.ext})`))),
      h('li', {}, h('button', { onclick: (e) => { save(); e.target.closest('details').open = false; const it = lib().items[item.id]; printHtml(it.meta.title, it.body, { dc: dublinCore(it) }); } }, 'Print or save as PDF from the browser')),
      h('li', { class: 'menu-title' }, 'Metadata'),
      h('li', {}, h('button', { onclick: () => exportDublinCore(lib().items[item.id]) }, 'Dublin Core XML')),
      h('li', {}, h('button', { onclick: () => exportCsl([lib().items[item.id]], item.meta.title) }, 'CSL JSON (for Zotero)'))));

  const metaPanel = h('details', { class: 'doc-meta' },
    h('summary', { class: 'btn btn-sm' }, icon('settings', 14), 'Details and citation'),
    h('div', { class: 'doc-meta-body' }, Citation(item), MetaForm(item), DublinCore(item)));

  return h('div', { class: 'doc-page' },
    h('div', { class: 'doc-bar' },
      h('nav', { class: 'crumbs' }, h('a', { href: '#files/docs' }, 'Dashi docs'), ' / '),
      h('input', { class: 'title-input doc-title', value: item.meta.title, 'aria-label': 'Title', onchange: (e) => setMeta(lib().items[item.id], { title: e.target.value }) }),
      words,
      h('span', { class: 'muted small' }, byline(item.meta)),
      h('span', { class: 'spacer' }),
      metaPanel,
      exportMenu,
      h('button', { class: 'btn btn-sm btn-ghost', 'aria-label': 'Delete doc', title: 'Delete doc', onclick: () => { closeEditor(); removeItem(item); } }, icon('trash', 14))),
    host);
}

/* ---------- Bibliographies ---------- */

function Upsell() {
  return h('div', {},
    PluginHeader('library', { title: 'Annotated bibliographies' }),
    h('div', { class: 'card upsell' },
      icon('lock', 28),
      h('div', {},
        h('h3', {}, 'Annotated bibliographies come with the Standard and Custom plans'),
        h('p', {}, 'Collect sources into bibliographies, write 200–600 word annotations, tag them against a shared lexicon, group them with rules, and send a weekly policy brief and newsletter. References come out in APA 7.'),
        h('a', { class: 'btn btn-sm btn-primary', href: 'org.html#plan' }, 'See plans'))));
}

function BibList() {
  if (!bibsAllowed) return Upsell();
  const bibs = Object.values(lib().bibs);
  return h('div', {},
    PluginHeader('library', { title: 'Annotated bibliographies', blurb: 'Collections of sources with annotations, a lexicon, grouping rules, APA reference lists and weekly briefs.', actions: h('button', { class: 'btn btn-sm btn-primary', onclick: newBib }, icon('plus', 14), 'New bibliography') }),
    bibs.length
      ? h('div', { class: 'bib-cards' }, bibs.map((b) => {
          const annotated = Object.entries(b.annotations).filter(([id, a]) => b.itemIds.includes(id) && a.text?.trim()).length;
          return h('a', { class: 'card bib-card', href: `#bib/${b.id}` },
            h('h3', {}, b.title),
            h('p', { class: 'muted' }, b.description || 'No description yet.'),
            h('div', { class: 'meter' }, h('span', { style: `width:${b.itemIds.length ? (annotated / b.itemIds.length) * 100 : 0}%` })),
            h('span', { class: 'small muted' }, `${annotated} of ${n(b.itemIds.length, 'source')} annotated · ${n(Object.keys(b.lexicon.terms).length, 'lexicon term')} · ${n(Object.keys(b.weeks).length, 'weekly brief')}`));
        }))
      : h('p', { class: 'empty' }, 'No bibliographies yet.'));
}

function newBib() {
  const title = prompt('Name of the bibliography', 'Annotated bibliography');
  if (!title?.trim()) return;
  const bib = blankBib(title.trim());
  apply(col.add('bibs', bib));
  location.hash = `bib/${bib.id}`;
}

const updateBib = (bib, patch) => apply(col.update('bibs', bib.id, patch));

function BibPage(bib) {
  migrateBib(bib);
  const tabs = [
    { id: 'annotations', label: 'Annotations', icon: 'doc' },
    { id: 'lexicon', label: 'Lexicon', icon: 'tidy' },
    { id: 'groups', label: 'Groups', icon: 'strategy' },
    { id: 'references', label: 'APA references', icon: 'book' },
    { id: 'weekly', label: 'Weekly brief and newsletter', icon: 'news' },
  ].map((t) => ({ ...t, href: `#bib/${bib.id}/${t.id}` }));
  const [, , tab] = route();
  const current = tab || 'annotations';
  const body = { annotations: Annotations, lexicon: Lexicon, groups: Groups, references: References, weekly: Weekly }[current] ?? Annotations;
  return h('div', { class: 'bib-page' },
    PluginHeader('library', {
      title: bib.title,
      blurb: bib.description || 'An annotated bibliography.',
      actions: h('div', { class: 'lib-actions' },
        h('button', { class: 'btn btn-sm', onclick: () => pickItems(bib) }, icon('plus', 14), 'Add sources'),
        ImportButton(null, bib),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: () => {
          const title = prompt('Name', bib.title);
          if (title == null) return;
          const description = prompt('One line on what it collects', bib.description) ?? bib.description;
          updateBib(bib, { title: title.trim() || bib.title, description: description.trim() });
          render();
        } }, 'Rename'),
        h('button', { class: 'btn btn-sm btn-ghost', 'aria-label': 'Delete bibliography', onclick: () => { if (confirm(`Delete “${bib.title}” and its annotations? The documents stay in the library.`)) { apply(col.remove('bibs', bib.id)); location.hash = 'bibs'; } } }, icon('trash', 14))),
      tabs, current,
    }),
    body(bib));
}

/** Pick library items to add to a bibliography. */
function pickItems(bib) {
  const chosen = new Set(bib.itemIds);
  let q = '';
  const listEl = h('div', { class: 'pick-list' });
  const draw = () => listEl.replaceChildren(...searchItems(lib(), q).sort((a, b) => sortKey(a.meta).localeCompare(sortKey(b.meta))).map((it) => h('label', { class: 'pick-row' },
    h('input', { type: 'checkbox', class: 'checkbox checkbox-sm', checked: chosen.has(it.id), onchange: (e) => (e.target.checked ? chosen.add(it.id) : chosen.delete(it.id)) }),
    h('span', { innerHTML: runsToHtml(apaReference(it.meta)) }))));
  draw();
  const dlg = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-box pick-box' },
      h('h3', {}, `Sources in ${bib.title}`),
      h('input', { class: 'input input-sm w-full', type: 'search', placeholder: 'Search the library', oninput: (e) => { q = e.target.value; draw(); } }),
      listEl,
      h('div', { class: 'modal-action' },
        h('button', { class: 'btn btn-sm', onclick: () => dlg.close() }, 'Cancel'),
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => { updateBib(bib, { itemIds: [...chosen].filter((id) => lib().items[id]) }); dlg.close(); render(); } }, 'Save'))));
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
}

const bibItems = (bib) => bib.itemIds.map((id) => lib().items[id]).filter(Boolean);
const allTags = (bib) => [...new Set(Object.values(bib.annotations).flatMap((a) => a.tags ?? []))].sort();

function Annotations(bib) {
  const items = bibItems(bib).sort((a, b) => sortKey(a.meta).localeCompare(sortKey(b.meta)));
  const annotated = items.filter((it) => bib.annotations[it.id]?.text?.trim()).length;
  let filter = 'all';
  const listEl = h('div', { class: 'annotation-list' });
  const draw = () => listEl.replaceChildren(...items.filter((it) => {
    const a = bib.annotations[it.id];
    const len = annotationLength(wordCount(a?.text));
    return filter === 'all' || (filter === 'todo' ? len === 'empty' : filter === 'short' ? len === 'short' || len === 'long' : len === 'ok');
  }).map((it) => AnnotationCard(bib, it)));
  draw();
  if (!items.length) return h('div', { class: 'empty-state' }, h('p', {}, 'No sources in this bibliography yet.'), h('button', { class: 'btn btn-sm btn-primary', onclick: () => pickItems(bib) }, 'Add sources from the library'));
  return h('div', {},
    h('div', { class: 'lib-toolbar' },
      h('h2', {}, `${annotated} of ${n(items.length, 'source')} annotated`),
      h('div', { class: 'join' }, [['all', 'All'], ['todo', 'Not started'], ['short', 'Too short or long'], ['ok', '200–600 words']].map(([id, label]) =>
        h('button', { class: `btn btn-xs join-item${filter === id ? ' btn-active' : ''}`, onclick: (e) => { filter = id; e.target.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('btn-active', b === e.target)); draw(); } }, label)))),
    bib.lexicon.constrainTags && h('p', { class: 'muted small' }, 'Tags come from this bibliography’s lexicon (Lexicon tab).'),
    listEl);
}

function AnnotationCard(bib, item) {
  const a = bib.annotations[item.id] ?? { text: '', tags: [] };
  const count = h('span', { class: 'word-count' });
  const meter = h('div', { class: 'word-meter', 'aria-hidden': 'true' }, h('span'));
  const show = (text) => {
    const w = wordCount(text);
    const len = annotationLength(w);
    count.textContent = `${w} words${len === 'short' ? ` · ${200 - w} to go` : len === 'long' ? ` · ${w - 600} over` : len === 'ok' ? ' · good length' : ''}`;
    count.dataset.len = len;
    meter.dataset.len = len;
    meter.firstChild.style.width = `${Math.min(100, (w / 600) * 100)}%`;
  };
  show(a.text);
  const save = (patch) => {
    const next = { ...a, ...patch, updatedAt: now(), by: me?.id ?? a.by ?? null, addedAt: a.addedAt ?? now() };
    apply(col.update('bibs', bib.id, { annotations: { ...lib().bibs[bib.id].annotations, [item.id]: next } }));
  };
  const author = a.by && org.staff[a.by];
  return h('article', { class: 'card annotation' },
    h('div', { class: 'annotation-head' },
      h('p', { class: 'reference', innerHTML: runsToHtml(apaReference(item.meta)) }),
      h('a', { class: 'btn btn-xs btn-ghost', href: `#item/${item.id}` }, 'Open'),
      h('button', { class: 'icon-button', 'aria-label': 'Take out of this bibliography', title: 'Take out of this bibliography', onclick: () => { updateBib(bib, { itemIds: bib.itemIds.filter((x) => x !== item.id) }); render(); } }, '×')),
    h('textarea', { class: 'textarea annotation-text', rows: 6, placeholder: 'Summarise the source, assess it (method, evidence, bias), and say how it bears on this collection. 200–600 words.', 'aria-label': `Annotation for ${item.meta.title}`,
      oninput: (e) => show(e.target.value), onchange: (e) => save({ text: e.target.value }) }, a.text ?? ''),
    h('div', { class: 'annotation-foot' },
      h('div', { class: 'word-box' }, meter, count),
      TagInput(a.tags ?? [], (tags) => { save({ tags }); render(); }, { label: 'Tags', allowed: allowedTags(bib), suggestions: allTags(bib) }),
      a.updatedAt && h('span', { class: 'muted small' }, author ? Avatar(author, 18) : null, ` ${author ? author.name.split(' ')[0] : ''} · ${new Date(a.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · week ${weekKey(new Date(a.updatedAt)).split('-W')[1]}`)));
}

/** The lexicon: a fixed vocabulary of terms in facets, scored against each source. */
function Lexicon(bib) {
  const lx = bib.lexicon;
  const facets = Object.values(lx.facets);
  const terms = Object.values(lx.terms).sort((a, b) => (lx.facets[a.facetId]?.name ?? '~').localeCompare(lx.facets[b.facetId]?.name ?? '~') || a.label.localeCompare(b.label));
  const items = bibItems(bib).sort((a, b) => sortKey(a.meta).localeCompare(sortKey(b.meta)));
  const setLx = (patch) => { updateBib(bib, { lexicon: { ...lib().bibs[bib.id].lexicon, ...patch } }); render(); };
  const cell = (itemId, termId) => lx.cells[itemId]?.[termId] ?? 0;
  const cycle = (itemId, termId) => {
    const v = (cell(itemId, termId) + 1) % 4;
    setLx({ cells: { ...lx.cells, [itemId]: { ...(lx.cells[itemId] ?? {}), [termId]: v } } });
  };
  const addTerm = () => {
    const label = prompt('New term (a word or short phrase)');
    if (!label?.trim()) return;
    if (terms.some((t) => t.label.toLowerCase() === label.trim().toLowerCase())) { alert('That term is already in the lexicon.'); return; }
    const id = uid('term');
    setLx({ terms: { ...lx.terms, [id]: { id, label: label.trim().toLowerCase(), definition: '', facetId: facets[0]?.id ?? null } } });
  };
  const addFacet = () => {
    const name = prompt('New facet (a dimension of the data model, e.g. Scale, Actor, Policy lever)');
    if (!name?.trim()) return;
    const id = uid('facet');
    setLx({ facets: { ...lx.facets, [id]: { id, name: name.trim() } } });
  };
  const LEVELS = ['Not addressed', 'Mentioned', 'Discussed', 'Central'];
  return h('div', { class: 'lexicon' },
    h('p', { class: 'lede' }, 'A constrained lexicon is the vocabulary for this collection: terms grouped into facets of your data model. Score each source against each term, and (optionally) allow only these terms as annotation tags, so tags stay consistent across people and weeks.'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', class: 'toggle toggle-sm toggle-primary', checked: !!lx.constrainTags, onchange: (e) => setLx({ constrainTags: e.target.checked }) }), 'Annotation tags must come from the lexicon'),
    h('div', { class: 'lex-columns' },
      h('section', { class: 'card' },
        h('div', { class: 'section-head' }, h('h3', {}, 'Facets'), h('button', { class: 'btn btn-xs', onclick: addFacet }, '+ Facet')),
        facets.length ? h('ul', { class: 'plain-list' }, facets.map((f) => h('li', {},
          h('input', { class: 'input input-xs', value: f.name, 'aria-label': 'Facet name', onchange: (e) => setLx({ facets: { ...lx.facets, [f.id]: { ...f, name: e.target.value } } }) }),
          h('span', { class: 'muted small' }, n(terms.filter((t) => t.facetId === f.id).length, 'term')),
          h('button', { class: 'icon-button', 'aria-label': `Remove ${f.name}`, onclick: () => { const next = { ...lx.facets }; delete next[f.id]; setLx({ facets: next }); } }, '×')))) : h('p', { class: 'muted small' }, 'No facets yet.')),
      h('section', { class: 'card grow' },
        h('div', { class: 'section-head' }, h('h3', {}, `Terms (${terms.length})`), h('button', { class: 'btn btn-xs', onclick: addTerm }, '+ Term')),
        terms.length ? h('table', { class: 'term-table' }, h('tbody', {}, terms.map((t) => h('tr', {},
          h('td', {}, h('input', { class: 'input input-xs', value: t.label, 'aria-label': 'Term', onchange: (e) => setLx({ terms: { ...lx.terms, [t.id]: { ...t, label: e.target.value.trim().toLowerCase() } } }) })),
          h('td', {}, h('select', { class: 'select select-xs', 'aria-label': 'Facet', onchange: (e) => setLx({ terms: { ...lx.terms, [t.id]: { ...t, facetId: e.target.value || null } } }) }, h('option', { value: '' }, 'No facet'), options(facets.map((f) => ({ id: f.id, label: f.name })), t.facetId))),
          h('td', { class: 'grow' }, h('input', { class: 'input input-xs w-full', value: t.definition ?? '', placeholder: 'What it means here', 'aria-label': 'Definition', onchange: (e) => setLx({ terms: { ...lx.terms, [t.id]: { ...t, definition: e.target.value } } }) })),
          h('td', {}, h('button', { class: 'icon-button', 'aria-label': `Remove ${t.label}`, onclick: () => { const next = { ...lx.terms }; delete next[t.id]; setLx({ terms: next }); } }, '×')))))) : h('p', { class: 'muted small' }, 'No terms yet.'))),
    h('h2', {}, 'Matrix'),
    h('p', { class: 'muted small' }, 'Click a cell to step through: ', LEVELS.map((l, i) => h('span', { class: 'lvl-key' }, h('i', { class: `lvl lvl-${i}` }), l)), '.'),
    terms.length && items.length ? h('div', { class: 'matrix-wrap' }, h('table', { class: 'matrix' },
      h('thead', {},
        h('tr', {}, h('th', {}), ...groupBy(terms, (t) => t.facetId).map(([fid, ts]) => h('th', { colspan: ts.length, class: 'facet-head' }, lx.facets[fid]?.name ?? 'No facet'))),
        h('tr', {}, h('th', { class: 'src-head' }, 'Source'), ...terms.map((t) => h('th', { class: 'term-head', title: t.definition || t.label }, h('span', {}, t.label))))),
      h('tbody', {}, items.map((it) => h('tr', {},
        h('th', { class: 'src' }, h('a', { href: `#item/${it.id}` }, apaCitation(it.meta).replace(/^\(|\)$/g, ''))),
        ...terms.map((t) => { const v = cell(it.id, t.id); return h('td', {}, h('button', { class: `lvl lvl-${v}`, title: `${it.meta.title} × ${t.label}: ${LEVELS[v]}`, 'aria-label': `${t.label} in ${it.meta.title}: ${LEVELS[v]}`, onclick: () => cycle(it.id, t.id) })); })))),
      h('tfoot', {}, h('tr', {}, h('th', {}, 'Sources'), ...terms.map((t) => h('td', { class: 'num' }, String(items.filter((it) => cell(it.id, t.id) > 0).length))))))) : h('p', { class: 'empty' }, 'Add terms and sources to fill the matrix.'));
}
const groupBy = (xs, key) => { const m = new Map(); for (const x of xs) { const k = key(x) ?? ''; if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return [...m]; };

/** Groups: rules in a small grammar that sort the sources. */
function Groups(bib) {
  const groups = groupItems(lib(), bib);
  const setGroups = (list) => { updateBib(bib, { groups: list }); render(); };
  const rules = bib.groups;
  return h('div', { class: 'groups' },
    h('div', { class: 'groups-grid' },
      h('section', { class: 'card' },
        h('div', { class: 'section-head' }, h('h3', {}, 'Rules'), h('button', { class: 'btn btn-xs', onclick: () => setGroups([...rules, { id: uid('group'), name: 'New group', rule: 'tag:' }]) }, '+ Rule')),
        rules.length ? h('ol', { class: 'rule-list' }, rules.map((g, i) => {
          let err = '';
          try { parseRule(g.rule); } catch (e) { err = e.message; }
          return h('li', {},
            h('input', { class: 'input input-xs', value: g.name, placeholder: 'Group name', 'aria-label': 'Group name', onchange: (e) => setGroups(rules.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x))) }),
            h('input', { class: `input input-xs rule-input${err ? ' input-error' : ''}`, value: g.rule, 'aria-label': 'Rule', spellcheck: false, onchange: (e) => setGroups(rules.map((x) => (x.id === g.id ? { ...x, rule: e.target.value } : x))) }),
            h('div', { class: 'rule-tools' },
              h('button', { class: 'icon-button', disabled: i === 0, 'aria-label': 'Move up', onclick: () => { const next = [...rules]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setGroups(next); } }, '↑'),
              h('button', { class: 'icon-button', 'aria-label': 'Remove rule', onclick: () => setGroups(rules.filter((x) => x.id !== g.id)) }, '×')),
            err && h('span', { class: 'rule-error' }, err));
        })) : h('p', { class: 'muted small' }, 'No rules yet: every source is in one group.')),
      h('section', { class: 'card grammar' },
        h('h3', {}, 'The grouping grammar'),
        h('p', { class: 'small' }, 'A rule is a filter or a facet. Filters can be combined with AND (or just a space), OR, NOT and brackets. A source can be in more than one filter group; sources no rule catches go in “Everything else”.'),
        h('table', { class: 'grammar-table' }, h('tbody', {}, [
          ['tag:housing', 'annotated with a tag'],
          ['term:equity', 'scores on a lexicon term'],
          ['facet:"policy lever"', 'scores on any term in a facet'],
          ['type:report', 'a kind of work (report, book, webpage…)'],
          ['year>=2020, year:2015..2019', 'by year'],
          ['author:okafor', 'an author’s name contains'],
          ['folder:"field notes"', 'in a library folder'],
          ['has:annotation, has:file', 'has one'],
          ['words<200', 'annotation length'],
          ['resilience', 'a word in the title, abstract or annotation'],
          ['by tag, by year, by decade, by type, by author, by facet:Scale', 'one group per value'],
        ].map(([code, what]) => h('tr', {}, h('td', {}, h('code', {}, code)), h('td', { class: 'muted' }, what))))),
        h('p', { class: 'small' }, 'Example: ', h('code', {}, 'tag:housing AND (term:equity OR year>=2020) NOT type:webpage')))),
    h('h2', {}, 'Groups'),
    h('div', { class: 'group-cards' }, groups.map((g) => h('section', { class: 'card group-card' },
      h('h3', {}, g.name || 'Untitled group', h('span', { class: 'badge badge-sm badge-ghost' }, g.itemIds.length)),
      g.rule && h('code', { class: 'small muted' }, g.rule),
      g.error ? h('p', { class: 'rule-error' }, g.error) : g.itemIds.length ? h('ul', { class: 'plain-list small' }, g.itemIds.map((id) => h('li', {}, h('a', { href: `#item/${id}` }, lib().items[id].meta.title || 'Untitled'), h('span', { class: 'muted' }, ` ${apaCitation(lib().items[id].meta)}`)))) : h('p', { class: 'muted small' }, 'No sources match.')))));
}

/** The APA reference list, whole or by group, to copy or download. */
let refsByGroup = false;
function References(bib) {
  const items = bibItems(bib);
  const groups = refsByGroup ? groupItems(lib(), bib).filter((g) => g.itemIds.length) : [{ name: '', itemIds: items.map((i) => i.id) }];
  const markdown = () => groups.map((g) => `${g.name ? `## ${g.name}\n\n` : ''}${apaList(g.itemIds.map((id) => lib().items[id].meta)).map(runsToMarkdown).join('\n\n')}`).join('\n\n');
  const extra = () => groups.flatMap((g) => referenceBlocks(g.itemIds.map((id) => lib().items[id]), g.name || null));
  const dc = { title: `${bib.title}: references`, creator: [org.name], subject: allTags(bib), description: bib.description, language: 'en', date: new Date().toISOString().slice(0, 10) };
  const save = async (f) => {
    const blob = f.id === 'md' ? new Blob([`# ${bib.title}: references\n\n${markdown()}\n`], { type: f.type }) : await renderMarkdown('', f.id, { title: `${bib.title}: References`, dc, extraBlocks: extra() });
    download(blob, fileName(`${bib.title} references`, f.ext), f.type);
  };
  return h('div', { class: 'references' },
    h('div', { class: 'lib-toolbar' },
      h('h2', {}, `References (${items.length})`),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: refsByGroup, onchange: (e) => { refsByGroup = e.target.checked; render(); } }), 'By group'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', onclick: () => navigator.clipboard?.writeText(groups.map((g) => `${g.name ? `${g.name}\n\n` : ''}${apaList(g.itemIds.map((id) => lib().items[id].meta)).map(runsToText).join('\n\n')}`).join('\n\n')).then(() => toast('Copied')) }, 'Copy'),
      FORMATS.map((f) => h('button', { class: 'btn btn-sm', onclick: () => save(f) }, f.label)),
      h('button', { class: 'btn btn-sm', onclick: () => exportCsl(items, `${bib.title} references`) }, 'CSL JSON')),
    h('div', { class: 'card ref-sheet' }, groups.map((g) => [
      g.name && h('h3', {}, g.name),
      apaList(g.itemIds.map((id) => lib().items[id].meta)).map((r) => h('p', { class: 'reference', innerHTML: runsToHtml(r) })),
    ]), !items.length && h('p', { class: 'empty' }, 'No sources yet.')));
}

/** The weekly brief: state of play, policy brief, tag map and newsletter. */
let week = weekKey();
let briefEditor = null;
function Weekly(bib) {
  const w = bib.weeks[week] ?? { policy: '', stateOfPlay: '' };
  const notes = weekAnnotations(lib(), bib, week);
  const map = tagMap(bib, { week });
  const saveWeek = (patch) => updateBib(bib, { weeks: { ...lib().bibs[bib.id].weeks, [week]: { ...(lib().bibs[bib.id].weeks[week] ?? {}), ...patch, updatedAt: now() } } });
  const go = (k) => { week = k; render(); };
  const preview = h('div', { class: 'newsletter-preview' });
  const md = () => newsletter(lib(), lib().bibs[bib.id], week, { orgName: org.name });
  const drawPreview = () => { preview.innerHTML = toHtml(parseMarkdown(md())); };
  drawPreview();
  const dc = { title: `${bib.title}: week of ${weekLabel(week)}`, creator: [org.name], subject: map.tags.map((t) => t.tag), language: 'en', date: new Date().toISOString().slice(0, 10), description: w.stateOfPlay?.slice(0, 280) };

  const policyHost = h('div', { class: 'brief-editor' });
  queueMicrotask(() => {
    try { briefEditor?.destroy(); } catch { /* gone */ }
    briefEditor = null;
    if (!window.toastui?.Editor) { policyHost.replaceChildren(h('textarea', { class: 'textarea w-full', rows: 12, onchange: (e) => { saveWeek({ policy: e.target.value }); drawPreview(); } }, w.policy ?? '')); return; }
    let t;
    briefEditor = new window.toastui.Editor({
      el: policyHost, height: '360px', initialEditType: 'wysiwyg', previewStyle: 'tab', initialValue: w.policy ?? '', usageStatistics: false,
      placeholder: 'Purpose, key findings, implications, recommendations.',
      toolbarItems: [['heading', 'bold', 'italic'], ['ul', 'ol'], ['link', 'quote']],
      events: { change: () => { clearTimeout(t); t = setTimeout(() => { saveWeek({ policy: briefEditor.getMarkdown() }); drawPreview(); }, 700); } },
    });
  });

  const sop = h('textarea', { class: 'textarea w-full', rows: 4, placeholder: 'One paragraph: where things stand this week.', 'aria-label': 'State of play', oninput: (e) => { sopCount.textContent = `${wordCount(e.target.value)} words`; }, onchange: (e) => { saveWeek({ stateOfPlay: e.target.value }); drawPreview(); } }, w.stateOfPlay ?? '');
  const sopCount = h('span', { class: 'muted small' }, `${wordCount(w.stateOfPlay)} words`);

  return h('div', { class: 'weekly' },
    h('div', { class: 'week-bar' },
      h('button', { class: 'btn btn-sm btn-square', 'aria-label': 'Previous week', onclick: () => go(shiftWeek(week, -1)) }, '‹'),
      h('div', { class: 'week-label' }, h('strong', {}, `Week ${week.split('-W')[1]}`), h('span', { class: 'muted' }, weekLabel(week))),
      h('button', { class: 'btn btn-sm btn-square', 'aria-label': 'Next week', onclick: () => go(shiftWeek(week, 1)) }, '›'),
      week !== weekKey() && h('button', { class: 'btn btn-sm btn-ghost', onclick: () => go(weekKey()) }, 'This week'),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted small' }, `${n(notes.length, 'annotation')} this week · ${Object.keys(bib.weeks).length ? `briefs for ${n(Object.keys(bib.weeks).length, 'week')}` : 'no briefs yet'}`),
      h('button', { class: 'btn btn-sm', disabled: !notes.length, title: 'A first draft from this week’s annotations, to rewrite', onclick: () => {
        if ((w.policy?.trim() || w.stateOfPlay?.trim()) && !confirm('Replace this week’s brief and state of play with a fresh draft?')) return;
        saveWeek(draftBrief(lib(), lib().bibs[bib.id], week));
        render();
      } }, 'Draft from this week’s annotations')),
    h('div', { class: 'weekly-grid' },
      h('div', {},
        h('section', { class: 'card' }, h('div', { class: 'section-head' }, h('h3', {}, 'State of play'), sopCount), sop),
        h('section', { class: 'card' }, h('h3', {}, 'Policy brief'), policyHost),
        h('section', { class: 'card' },
          h('h3', {}, `This week’s annotations (${notes.length})`),
          notes.length ? h('ul', { class: 'plain-list' }, notes.map(({ item, annotation }) => h('li', { class: 'week-note' },
            h('a', { href: `#bib/${bib.id}/annotations` }, item.meta.title), h('span', { class: 'muted small' }, ` ${apaCitation(item.meta)} · ${wordCount(annotation.text)} words`),
            h('div', { class: 'tag-row' }, (annotation.tags ?? []).map((t) => h('span', { class: 'tag' }, t)))))) : h('p', { class: 'muted small' }, 'No annotations written this week.'))),
      h('div', {},
        h('section', { class: 'card' }, h('h3', {}, 'Tag map'), TagMapView(map)),
        h('section', { class: 'card newsletter-card' },
          h('div', { class: 'section-head' }, h('h3', {}, 'Newsletter'), h('span', { class: 'muted small' }, 'state of play, brief, annotations, tag map, references')),
          h('div', { class: 'row-actions' },
            FORMATS.map((f) => h('button', { class: 'btn btn-xs', onclick: async () => {
              const text = md();
              const blob = f.id === 'md' ? new Blob([text], { type: f.type }) : await renderMarkdown(text, f.id, { title: dc.title, dc });
              download(blob, fileName(`${bib.title} ${week}`, f.ext), f.type);
            } }, f.label)),
            h('button', { class: 'btn btn-xs', onclick: () => printHtml(dc.title, md(), { dc }) }, 'Print'),
            h('button', { class: 'btn btn-xs', onclick: () => {
              const html = toHtml(parseMarkdown(md()));
              const asText = () => navigator.clipboard?.writeText(md()).then(() => toast('Copied as text'));
              if (!window.ClipboardItem) { asText(); return; }
              const data = [new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([md()], { type: 'text/plain' }) })];
              navigator.clipboard.write(data).then(() => toast('Copied, ready to paste into an email'), asText);
            } }, 'Copy for email')),
          preview))));
}

/** Tags this week as a cloud sized by use, and the pairs that go together. */
function TagMapView(map) {
  if (!map.tags.length) return h('p', { class: 'muted small' }, 'No tagged annotations this week.');
  const max = map.tags[0].n;
  return h('div', {},
    h('div', { class: 'tag-cloud' }, map.tags.map((t) => h('span', { class: 'cloud-tag', style: `font-size:${(0.85 + (t.n / max) * 0.9).toFixed(2)}rem; --w:${(0.35 + (t.n / max) * 0.65).toFixed(2)}`, title: `${t.tag}: ${n(t.n, 'annotation')}` }, t.tag, h('small', {}, t.n)))),
    map.pairs.length > 0 && h('div', {},
      h('h4', {}, 'Often together'),
      h('ul', { class: 'pair-list' }, map.pairs.slice(0, 8).map((p) => h('li', {}, h('span', { class: 'tag' }, p.a), h('span', { class: 'pair-line', style: `--n:${p.n}` }), h('span', { class: 'tag' }, p.b), h('span', { class: 'muted small' }, ` ${p.n}×`))))));
}

render();

/**
 * Bring a reference list and its documents into an org's library, from the
 * command line: a Zotero export (CSL JSON, BibTeX or RIS) and any number of
 * files or folders of PDFs, Word files and the like.
 *
 *   npm run import -- --org riverbend Readings.json ~/Papers
 *   npm run import -- --org riverbend --bib "Readings" --folder "Readings" refs.bib a.pdf b.pdf
 *
 * Each file is matched to its reference (by a DOI inside it or in its name,
 * an ISBN in its name, its name, or the title its text starts with) and
 * attached to it; files with no reference come in on their own. What is
 * already in the library is left alone, so running it twice adds nothing.
 * Everything goes into a folder and an (unannotated) bibliography.
 *
 * If `pdftotext` (poppler) is installed, it reads the first pages of each PDF,
 * which finds more matches. The server can be running.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, basename } from 'node:path';
import { config } from './config.js';
import { openDb } from './db.js';
import { newId } from './app.js';
import { DOC_TYPES, sniffDocument, isDocumentName } from './uploads.js';
import { parseReferences, fileHints, matchReference, blankMeta, blankBib, migrateLibrary, blankLibrary, titleFromName, yearOf } from '../src/platform/library.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); if (i < 0) return fallback; const v = args[i + 1]; args.splice(i, 2); return v; };
const slug = opt('org');
const folderName = opt('folder', 'Readings');
const bibName = opt('bib', folderName);
if (!slug || !args.length) {
  console.log('Usage: npm run import -- --org <org address> [--folder Name] [--bib Name] <references.json|.bib|.ris> [files or folders…]');
  process.exit(1);
}

const db = openDb(config.dataDir);
const org = db.prepare('SELECT id, name FROM orgs WHERE slug = ?').get(slug);
if (!org) { console.error(`There's no org at “${slug}”.`); process.exit(1); }
const row = db.prepare("SELECT json FROM docs WHERE org_id = ? AND name = 'library'").get(org.id);
const lib = migrateLibrary(row ? JSON.parse(row.json) : blankLibrary());
const now = Date.now();
const stamp = new Date().toISOString();

// Sort the arguments into reference lists and documents.
const refFiles = [];
const docFiles = [];
const walk = (p) => {
  if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) walk(join(p, f)); return; }
  if (/\.(json|bib|ris)$/i.test(p)) refFiles.push(p);
  else if (isDocumentName(basename(p))) docFiles.push(p);
  else console.log(`  Skipped ${basename(p)}: not a kind of document the library keeps.`);
};
args.forEach(walk);

// The folder and bibliography.
let folder = Object.values(lib.folders).find((f) => f.name === folderName);
if (!folder) { folder = { id: newId('folder'), name: folderName, parentId: null }; lib.folders[folder.id] = folder; }
let bib = Object.values(lib.bibs).find((b) => b.title === bibName);
if (!bib) { bib = blankBib(bibName); bib.description = `Imported ${stamp.slice(0, 10)}.`; lib.bibs[bib.id] = bib; }
const inBib = new Set(bib.itemIds);

// References: skip what's there (same DOI, or same title and year).
const keyOf = (m) => (m.DOI ? `doi:${m.DOI.toLowerCase()}` : `t:${(m.title || '').toLowerCase().trim()}|${yearOf(m.issued)}`);
const byKey = new Map(Object.values(lib.items).map((i) => [keyOf(i.meta), i]));
let refsAdded = 0;
let refsThere = 0;
for (const file of refFiles) {
  for (const meta of parseReferences(readFileSync(file, 'utf8'), basename(file))) {
    const there = byKey.get(keyOf(meta));
    if (there) { refsThere++; inBib.add(there.id); continue; }
    const item = { id: newId('doc'), kind: meta.URL ? 'link' : 'ref', url: meta.URL ?? '', folderId: folder.id, tags: [], meta, createdAt: now, updatedAt: now, createdBy: null };
    lib.items[item.id] = item;
    byKey.set(keyOf(meta), item);
    inBib.add(item.id);
    refsAdded++;
  }
}

// Documents: store each once, then attach it to its reference.
const hasPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const known = new Set(db.prepare('SELECT filename, size FROM media WHERE org_id = ?').all(org.id).map((m) => `${m.filename}|${m.size}`));
const seen = new Set();
const dir = join(config.dataDir, 'media', org.id);
mkdirSync(dir, { recursive: true });
const report = [];
for (const path of docFiles) {
  const name = basename(path);
  const bytes = readFileSync(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (seen.has(hash)) { report.push(`  ${name}: the same file as one above, skipped.`); continue; }
  seen.add(hash);
  if (known.has(`${name}|${bytes.length}`)) { report.push(`  ${name}: already in the library.`); continue; }
  const ext = name.match(/\.([a-z0-9]+)$/i)[1].toLowerCase();
  const [mimetype, kind] = DOC_TYPES[ext];
  if (!sniffDocument(bytes.subarray(0, 512), name)) { report.push(`  ${name}: doesn't look like a real .${ext} file, skipped.`); continue; }

  let text = ext === 'txt' || ext === 'md' ? bytes.subarray(0, 20000).toString('utf8') : '';
  if (kind === 'pdf' && hasPdftotext) { try { text = execFileSync('pdftotext', ['-l', '2', path, '-'], { stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 24 }).toString('utf8'); } catch { /* unreadable */ } }
  text += `\n${bytes.subarray(0, 300000).toString('latin1')}\n${bytes.subarray(-200000).toString('latin1')}`;
  const hints = fileHints(name, text);

  // A chapter of a book that's here gets its own item, "in" the book.
  const chapter = text.match(/\bCHAPTER\s+(\d+)\s+([^\n]{4,140})/);
  let item = matchReference(lib.items, hints);
  const book = chapter && matchReference(lib.items, hints, { withFiles: true });
  if (!item && !chapter) {
    const twin = matchReference(lib.items, hints, { withFiles: true });
    if (twin?.file && twin.file.size === bytes.length) { report.push(`  ${name}: another copy of “${twin.meta.title}”, skipped.`); continue; }
  }

  const mediaId = newId('media');
  writeFileSync(join(dir, mediaId), bytes);
  db.prepare('INSERT INTO media (id, org_id, filename, mimetype, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(mediaId, org.id, name, mimetype, bytes.length, stamp, null);
  const fileInfo = { mediaId, name, size: bytes.length, type: mimetype.split(';')[0] };

  if (chapter) {
    if (book && (book.file || item === book) && ['book', 'chapter'].includes(book.meta.type)) {
      const m = book.meta;
      item = {
        id: newId('doc'), kind: 'file', folderId: folder.id, tags: [], createdAt: now, updatedAt: now, createdBy: null,
        meta: blankMeta({ type: 'chapter', title: chapter[2].replace(/[\p{Co}\p{Cf}]/gu, '').trim(), number: chapter[1], containerTitle: m.title, creators: m.creators.map((c) => ({ ...c, role: c.role === 'author' ? 'author' : c.role })), issued: m.issued, publisher: m.publisher, publisherPlace: m.publisherPlace, ISBN: m.ISBN, DOI: hints.dois.find((d) => d !== (m.DOI ?? '').toLowerCase() && d.startsWith((m.DOI ?? '~').toLowerCase().slice(0, 12))) ?? '' }),
      };
      lib.items[item.id] = item;
      Object.assign(item, { file: fileInfo });
      inBib.add(item.id);
      report.push(`  ${name} → a chapter of “${m.title}”: ${item.meta.title}`);
      continue;
    }
  }
  if (item) {
    Object.assign(item, { kind: 'file', file: fileInfo, updatedAt: now });
    report.push(`  ${name} → ${item.meta.title}`);
  } else {
    item = { id: newId('doc'), kind: 'file', folderId: folder.id, tags: [], meta: blankMeta({ type: ext === 'pdf' ? 'report' : 'document', title: titleFromName(name) }), file: fileInfo, createdAt: now, updatedAt: now, createdBy: null };
    lib.items[item.id] = item;
    report.push(`  ${name} → no reference found; added on its own`);
  }
  inBib.add(item.id);
}

bib.itemIds = [...inBib];
db.prepare(`INSERT INTO docs (org_id, name, json, version, updated_at, updated_by) VALUES (?, 'library', ?, 1, ?, NULL)
  ON CONFLICT (org_id, name) DO UPDATE SET json = excluded.json, version = version + 1, updated_at = excluded.updated_at`).run(org.id, JSON.stringify(lib), stamp);
db.close();

console.log(`\n${org.name}: ${refsAdded} references added${refsThere ? ` (${refsThere} skipped as repeats or already there)` : ''}, ${docFiles.length} files looked at${hasPdftotext ? '' : ' (install pdftotext to match more PDFs)'}.`);
console.log(report.join('\n'));
console.log(`\nAll in the folder “${folder.name}” and the bibliography “${bib.title}”. Open a page in the library to see them; reload if it was open.`);

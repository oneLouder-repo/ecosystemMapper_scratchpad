import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as L from '../src/platform/library.js';
import { parseMarkdown } from '../src/core/markdown.js';
import { docx, odt, xlsx } from '../src/core/office.js';
import { pdf } from '../src/core/pdf.js';

const article = {
  type: 'article-journal', title: 'Housing first in small cities',
  creators: [{ family: 'Okafor', given: 'Dana' }, { family: 'Lee', given: 'Min Jun' }],
  issued: '2021-03', containerTitle: 'Journal of Urban Policy', volume: '12', issue: '3', page: '45-67', DOI: '10.5555/abc',
};

test('APA references and citations follow APA 7', () => {
  const runs = L.apaReference(article);
  assert.equal(L.runsToText(runs), 'Okafor, D., & Lee, M. J. (2021). Housing first in small cities. Journal of Urban Policy, 12(3), 45–67. https://doi.org/10.5555/abc');
  assert.ok(runs.some((r) => r.i && r.t === 'Journal of Urban Policy'), 'the journal is in italics');
  assert.ok(runs.some((r) => r.i && r.t === '12'), 'so is the volume');
  assert.equal(L.apaCitation(article), '(Okafor & Lee, 2021)');
  assert.equal(L.apaCitation(article, { narrative: true }), 'Okafor and Lee (2021)');
  const book = { type: 'book', title: 'Book title', creators: [{ family: 'Smith', given: 'Jane' }], issued: '2018', publisher: 'Press' };
  assert.equal(L.runsToText(L.apaReference(book)), 'Smith, J. (2018). Book title. Press.');
  const list = L.apaList([article, book]).map(L.runsToText);
  assert.match(list[0], /^Okafor/, 'the list is in author order');
});

test('references import from BibTeX, RIS and CSL JSON, and go back out as CSL', () => {
  const [b] = L.parseBibtex('@article{k, author={Smith, Jane and Doe, John}, title={A {Title}}, journal={J}, year={2019}, doi={10.1/x}}');
  assert.equal(b.title, 'A Title');
  assert.deepEqual(b.creators.map((c) => c.family), ['Smith', 'Doe']);
  assert.equal(b.containerTitle, 'J');
  assert.equal(b.DOI, '10.1/x');
  const [r] = L.parseRis('TY  - BOOK\nAU  - Smith, Jane\nTI  - Book title\nPY  - 2018\nPB  - Press\nER  - \n');
  assert.equal(r.type, 'book');
  assert.equal(r.publisher, 'Press');
  const csl = JSON.parse(L.cslJson([{ meta: article }]));
  assert.equal(csl[0]['container-title'], 'Journal of Urban Policy');
  const back = L.parseReferences(JSON.stringify(csl), 'refs.json');
  assert.equal(back[0].title, article.title);
  assert.equal(L.yearOf(back[0].issued), '2021');
});

test('Dublin Core covers the item', () => {
  const dc = L.dublinCore({ meta: { ...article, keywords: ['rent'] } });
  assert.equal(dc.title, article.title);
  assert.match(L.dublinCoreXml({ meta: article }), /<dc:creator>Okafor, Dana<\/dc:creator>|<dc:creator>/);
});

test('weeks, word counts and annotation lengths', () => {
  assert.equal(L.weekKey(new Date(2021, 0, 3)), '2020-W53', 'ISO weeks belong to the year of their Thursday');
  assert.equal(L.weekKey(new Date(2026, 10, 1)), '2026-W44');
  assert.equal(L.shiftWeek('2020-W53', 1), '2021-W01');
  assert.equal(L.wordCount('One two, three — four.'), 4);
  assert.equal(L.annotationLength(0), 'empty');
  assert.equal(L.annotationLength(150), 'short');
  assert.equal(L.annotationLength(300), 'ok');
  assert.equal(L.annotationLength(700), 'long');
});

test('the grouping grammar: filters, facets and errors', () => {
  const lib = { items: { a: { id: 'a', meta: { ...article, keywords: ['rent'] } }, b: { id: 'b', meta: { type: 'book', title: 'B', issued: '2010', creators: [] } } }, folders: {}, bibs: {} };
  const bib = L.migrateBib({ id: 'x', title: 't', itemIds: ['a', 'b'], annotations: { a: { text: 'hi', tags: ['rent'] } },
    groups: [{ id: 'g1', name: 'Recent', rule: 'year>=2015' }, { id: 'g2', name: '', rule: 'by type' }, { id: 'g3', name: 'Broken', rule: 'tag:a AND (b' }] });
  const groups = L.groupItems(lib, bib);
  assert.deepEqual(groups.map((g) => [g.name, g.itemIds]), [['Recent', ['a']], ['Book', ['b']], ['Journal article', ['a']], ['Broken', []]]);
  assert.equal(groups[3].error, 'A bracket isn’t closed');
  assert.throws(() => L.parseRule('OR tag:x'), /wrong place/);
  assert.deepEqual(L.parseRule('by facet: Scale'), { by: 'facet', facet: 'Scale' });
  assert.deepEqual(L.parseRule(''), { all: true });
  const t = L.parseRule('tag:"food security" OR NOT year<2000').tree;
  assert.equal(t.op, 'or');
  assert.equal(t.a.value, 'food security');
  assert.equal(t.b.op, 'not');
});

test('Word, OpenDocument, Excel and PDF exports are well formed', async () => {
  const blocks = parseMarkdown('# Title\n\nSome **bold** and *italic* text.\n\n1. one\n2. two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  const dc = { title: 'Title', creator: 'Dashi' };
  const dir = mkdtempSync(join(tmpdir(), 'dashi-export-'));
  try {
    for (const [name, bytes] of [['t.docx', await docx(blocks, dc)], ['t.odt', await odt(blocks, dc)], ['t.xlsx', await xlsx([{ name: 'S', rows: [['a', 'b'], [1, 2]] }], dc)]]) {
      const buf = Buffer.from(bytes instanceof Blob ? await bytes.arrayBuffer() : bytes);
      assert.equal(buf.subarray(0, 4).toString('latin1'), 'PK\x03\x04', `${name} is a zip`);
      const file = join(dir, name);
      writeFileSync(file, buf);
      try { execFileSync('unzip', ['-tq', file], { stdio: 'pipe' }); } catch (err) {
        if (err.code !== 'ENOENT') assert.fail(`${name} fails the zip test: ${err.stderr}`);
      }
    }
    const p = pdf(blocks, dc);
    const text = Buffer.from(p instanceof Blob ? await p.arrayBuffer() : p).toString('latin1');
    assert.match(text, /^%PDF-1\.\d/);
    assert.match(text, /%%EOF\s*$/);
    assert.match(text, /\/Title \(Title\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('uploaded files find their references: DOI inside, DOI or ISBN in the name, the name, or the opening text', () => {
  assert.deepEqual(L.doisIn('/URI (https://doi.org/10.1126/science.aau0427)/S/URI ... doi=10.1016/j.chb.2018.12.027.'), ['10.1126/science.aau0427', '10.1016/j.chb.2018.12.027']);
  assert.deepEqual(L.doisIn('10.1016/S0747-5632(18)30613-7)'), ['10.1016/s0747-5632(18)30613-7'], 'brackets inside a DOI stay');
  const ref = (id, meta) => [id, { id, kind: 'ref', meta: { creators: [], ...meta } }];
  const items = Object.fromEntries([
    ref('gaia', { title: 'Gaia 2.0', DOI: '10.1126/science.aau0427' }),
    ref('hiphop', { title: 'Race, Class, Gender, and Rhymes', DOI: '10.1177/0027432118788138' }),
    ref('book', { title: 'Introduction to Anticipation Studies', DOI: '10.1007/978-3-319-63023-6' }),
    ref('zotero', { title: '35-MIXING-H-ET-NH-GBpdf_0' }),
    ref('kincheloe', { title: 'Knowledge and critical pedagogy: an introduction' }),
  ]);
  const match = (name, text) => L.matchReference(items, L.fileHints(name, text))?.id ?? null;
  assert.equal(match('158-SCIENCE_LENTON.pdf', 'refs 10.9999/other ... https://doi.org/10.1126/science.aau0427)'), 'gaia', 'any DOI in the file that is in the library');
  assert.equal(match('10.1177_0027432118788138.pdf'), 'hiphop', 'a DOI as the file name');
  assert.equal(match('978-3-319-63023-6 (1).pdf'), 'book', 'an ISBN in the name, inside the DOI');
  assert.equal(match('35-MIXING-H-ET-NH-GBpdf_0.pdf'), 'zotero', 'Zotero kept the file name as the title');
  assert.equal(match('89.Joe_L._Kincheloe.pdf.txt', 'Joe L. Kincheloe\nKnowledge and Critical Pedagogy\nAn Introduction'), 'kincheloe', 'the title the text opens with');
  assert.equal(match('holiday-photos.pdf', 'nothing here'), null);
  items.gaia.file = { mediaId: 'm' };
  assert.equal(match('gaia-again.pdf', '10.1126/science.aau0427'), null, 'only references with no file yet');
});

test('APA details: translators, unpublished manuscripts, issue-only magazines, two editors', () => {
  const ref = (m) => L.runsToText(L.apaReference({ creators: [], ...m }));
  assert.equal(ref({ type: 'manuscript', title: 'A clear inversion', issued: '2018', creators: [{ role: 'author', family: 'Latour', given: 'Bruno' }, { role: 'translator', family: 'Muecke', given: 'Stephen' }] }),
    'Latour, B. (2018). A clear inversion (S. Muecke, Trans.) [Unpublished manuscript].');
  assert.match(ref({ type: 'article-magazine', title: 'Intra-actions', containerTitle: 'Mousse', issue: '34', page: '76-81', issued: '2012', creators: [{ role: 'author', family: 'Kleinman', given: 'Adam' }] }), /Mousse, \(34\), 76–81\.$/);
  assert.match(ref({ type: 'chapter', title: 'Epistemology', containerTitle: 'Reader', creators: [{ role: 'editor', family: 'Coetzee', given: 'P. H.' }, { role: 'editor', family: 'Roux', given: 'A. P. J.' }] }), /In P\. H\. Coetzee & A\. P\. J\. Roux \(Eds\.\), Reader/);
});

test('tags gather from items, annotations and keywords, and lexicon terms are suggested from what a source says', () => {
  const lib = L.migrateLibrary({
    items: {
      a: { id: 'a', kind: 'ref', tags: ['housing'], meta: { title: 'Housing first', keywords: ['Homelessness'] } },
      b: { id: 'b', kind: 'link', tags: [], meta: { title: 'Food banks and local economies' } },
      m: { id: 'm', kind: 'file', file: { name: 'riverbend.dashi-map.json' }, meta: { title: 'Riverbend map' } },
    },
    bibs: { bib: { id: 'bib', title: 'Readings', itemIds: ['a', 'b'], annotations: { a: { text: 'x', tags: ['housing', 'equity'] }, b: { text: 'y', tags: ['food security'] } } } },
  });
  const tags = L.libraryTags(lib);
  assert.deepEqual(tags.find((t) => t.tag === 'housing'), { tag: 'housing', n: 1, itemIds: ['a'] }, 'a tag counts once per item');
  assert.deepEqual(tags.map((t) => t.tag).sort(), ['equity', 'food security', 'homelessness', 'housing']);
  assert.deepEqual(L.itemsTagged(lib, 'Equity').map((i) => i.id), ['a']);
  assert.equal(L.formatLabel(lib.items.m), 'Ecosystem map', 'map files are recognised');

  const bib = lib.bibs.bib;
  bib.lexicon.facets.f = { id: 'f', name: 'Policy lever' };
  bib.lexicon.terms.t1 = { id: 't1', label: 'funding policy', facetId: 'f' };
  bib.lexicon.terms.t2 = { id: 't2', label: 'zoning', facetId: 'f' };
  const s = L.suggestTags(lib, bib, { title: 'Local funding policies', text: 'It argues that housing and equity go together.', has: ['equity'] });
  assert.deepEqual(s[0], { tag: 'funding policy', from: 'lexicon', facet: 'Policy lever' }, 'lexicon first, plurals count');
  assert.ok(s.some((x) => x.tag === 'housing' && x.from === 'library'), 'then tags the library already uses');
  assert.ok(!s.some((x) => x.tag === 'equity'), 'not ones it already has');
  assert.ok(!s.some((x) => x.tag === 'zoning'));
  bib.lexicon.constrainTags = true;
  assert.ok(!L.suggestTags(lib, bib, { text: 'housing' }).some((x) => x.from === 'library'), 'a constrained lexicon suggests only its terms');
});

test('the weekly brief can be laid out by STEEPLE, micro/meso/macro or a lexicon facet', () => {
  const week = L.weekKey(new Date());
  const t = Date.now();
  const lib = L.migrateLibrary({
    items: {
      a: { id: 'a', kind: 'ref', tags: [], meta: { title: 'Rent and wages', creators: [{ family: 'Ng' }], issued: '2024' } },
      b: { id: 'b', kind: 'link', url: 'https://example.org/b', tags: ['environment'], meta: { title: 'Heat and housing', creators: [{ family: 'Roy' }], issued: '2023' } },
      c: { id: 'c', kind: 'ref', tags: [], meta: { title: 'Untagged', creators: [{ family: 'Lo' }], issued: '2022' } },
    },
    bibs: { bib: { id: 'bib', title: 'Readings', itemIds: ['a', 'b', 'c'], annotations: {
      a: { text: 'It finds rents outpace wages.', tags: ['economics', 'micro'], updatedAt: t },
      b: { text: 'Shows heat risk rises.', tags: ['macro'], updatedAt: t },
      c: { text: 'A note.', tags: [], updatedAt: t },
    } } },
  });
  const bib = lib.bibs.bib;
  const steeple = L.draftBrief(lib, bib, week, { framework: 'steeple' });
  assert.match(steeple.policy, /## Findings by STEEPLE/);
  assert.match(steeple.policy, /### Economic\n\n- It finds rents outpace wages\. \(Ng, 2024\)/, 'economics counts as Economic');
  assert.match(steeple.policy, /### Environmental\n\n- Shows heat risk rises\./, 'an item tag counts too');
  assert.match(steeple.policy, /### Legal\n\n- \*Nothing this week/, 'empty categories show as gaps');
  assert.match(steeple.policy, /### Not yet placed\n\n- A note\./);
  assert.ok(steeple.recommendations.length > 0);
  const mmm = L.draftBrief(lib, bib, week, { framework: 'micro-meso-macro' });
  assert.match(mmm.policy, /### Micro\n\n- It finds/);
  assert.match(mmm.policy, /### Macro\n\n- Shows heat/);
  bib.lexicon.facets.s = { id: 's', name: 'Scale' };
  bib.lexicon.terms.x = { id: 'x', label: 'household', facetId: 's' };
  bib.lexicon.terms.y = { id: 'y', label: 'region', facetId: 's' };
  bib.lexicon.cells.a = { x: 2 };
  const facet = L.draftBrief(lib, bib, week, { framework: 'facet:s' });
  assert.match(facet.policy, /### household\n\n- It finds/, 'a lexicon facet is a framework, and matrix scores place sources');
  const res = L.weekResources(lib, bib, week);
  assert.equal(res.find((r) => r.id === 'b').url, 'https://example.org/b');
  bib.weeks[week] = { policy: 'P', stateOfPlay: 'S', recommendations: '1. Do it' };
  const md = L.newsletter(lib, bib, week);
  assert.match(md, /## Recommendations\n\n1\. Do it/);
  assert.match(md, /## Resources\n\n- /);
});

test('a tag renames, or merges into another, everywhere it is used', () => {
  const lib = L.migrateLibrary({
    items: { a: { id: 'a', kind: 'ref', tags: ['Food Security', 'housing'], meta: { title: 'A', keywords: ['food security'] } } },
    bibs: { b: { id: 'b', title: 'B', itemIds: ['a'], annotations: { a: { text: '', tags: ['food security', 'food systems'] } } } },
  });
  const { items, bibs } = L.renameTag(lib, 'food security', 'food systems');
  assert.deepEqual(items.a.tags, ['food systems', 'housing']);
  assert.deepEqual(items.a.meta.keywords, ['food systems']);
  assert.deepEqual(bibs.b.annotations.a.tags, ['food systems'], 'merging leaves one copy');
  assert.deepEqual(L.renameTag(lib, 'nothing', 'x'), { items: {}, bibs: {} });
});

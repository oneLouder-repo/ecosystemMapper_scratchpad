import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrg, seedRiverbend, blankOrg, migrateOrg, pluginOn } from '../src/platform/org.js';
import { PALETTES, SHAPES } from '../src/platform/themes.js';
import { PLUGINS, enabledPlugins } from '../src/plugins.js';
import { mapEntry, mapsFor } from '../src/platform/maps.js';
import { seedPodcasts, migratePodcasts, episodesOf, stationView, nextNumber, podcastRss, published, isAudioFile } from '../src/platform/podcasts.js';
import { seedPages, seedRiverbendPages, siteContent, uniqueSlug, parseMarkdown, parseInline, safeHref, embedsIn, plainText } from '../src/platform/pages.js';
import { seedRiverbendStrategy } from '../src/platform/strategySeed.js';
import { seedDashboards } from '../src/platform/dashboards.js';
import { migrateStrategy } from '../src/platform/strategy.js';

test('orgs carry a profile, a theme from the offered list, and plugin switches', () => {
  for (const org of [seedOrg(), seedRiverbend(), blankOrg({ id: 'org-x', name: 'X' })]) {
    assert.ok(PALETTES.some((p) => p.id === org.theme.palette), org.name);
    assert.ok(SHAPES.some((s) => s.id === org.theme.shape), org.name);
    assert.ok(Object.values(org.staff).some((s) => s.roleId === 'admin'), `${org.name} has an admin`);
    for (const s of Object.values(org.staff)) assert.ok(Array.isArray(s.interests) && 'avatar' in s);
  }
  assert.equal(pluginOn(seedRiverbend(), 'podcasts'), false);
  assert.ok(!enabledPlugins(seedRiverbend()).some((p) => p.id === 'podcasts'));
  // Orgs saved when the plugin was Radio & Podcasts keep their switch.
  assert.equal(pluginOn(migrateOrg({ id: 'o', name: 'O', plugins: { radio: false } }), 'podcasts'), false);
  assert.equal(enabledPlugins(seedOrg()).length, PLUGINS.length);
});

test('migrateOrg fills in fields added since a document was saved', () => {
  const old = { id: 'o', name: 'Old', staff: { a: { id: 'a', name: 'A', roleId: 'admin' } }, teams: {}, sites: {} };
  const org = migrateOrg(old);
  assert.deepEqual(org.theme, { palette: 'corporate', shape: 'rounded' });
  assert.equal(org.contact.email, '');
  assert.deepEqual(org.staff.a.teamIds, []);
  assert.deepEqual(org.staff.a.interests, []);
});

test('core plugins cannot be switched off', () => {
  const org = migrateOrg({ id: 'o', name: 'O', plugins: { org: false, help: false, mapper: false } });
  const ids = enabledPlugins(org).map((p) => p.id);
  assert.ok(ids.includes('org') && ids.includes('help'));
  assert.ok(!ids.includes('mapper'));
});

test('mapsFor lists the maps a person owns or belongs to', () => {
  const index = { maps: {
    a: mapEntry({ id: 'a', ownerId: 's1', memberIds: ['s2'] }),
    b: mapEntry({ id: 'b', ownerId: 's2', memberIds: [] }),
    c: mapEntry({ id: 'c', ownerId: 's3', memberIds: ['s3'] }),
  } };
  assert.deepEqual(mapsFor(index, 's2').map((m) => m.id), ['a', 'b']);
  assert.deepEqual(mapsFor(index, 's9'), []);
});

test('the second example org has its own strategy, data measures and public dashboard', () => {
  const s = migrateStrategy(seedRiverbendStrategy());
  const { dashboards } = seedDashboards(s);
  assert.deepEqual(Object.keys(dashboards), ['dash-meals']);
  assert.equal(dashboards['dash-meals'].siteId, 'site-main');
  assert.ok(seedRiverbend().sites['site-main']);
});

test('podcasts: seasons, featured shows and the station page', () => {
  const doc = seedPodcasts();
  const org = seedOrg();
  for (const p of Object.values(doc.podcasts)) for (const id of p.hostIds) assert.ok(org.staff[id], `host ${id}`);
  for (const e of Object.values(doc.episodes)) assert.ok(doc.podcasts[e.podcastId].seasons[e.season], `${e.id} is in a season of its show`);
  const eps = episodesOf(doc, 'pod-stem-voices');
  assert.deepEqual(eps.map((e) => `${e.season}.${e.number}`), ['2.3', '2.2', '2.1', '1.2', '1.1', '1.0'], 'newest season first');

  const v = stationView(doc, '2026-10-25');
  assert.equal(v.current.id, 'ep-sv-4', 'the newest published episode is current');
  assert.deepEqual(v.featured.map((f) => f.show.id), ['pod-stem-voices', 'pod-land'], 'featured shows, in order');
  assert.equal(v.featured[0].latest.id, 'ep-sv-4');
  assert.ok(v.archive.some((a) => a.show.id === 'pod-instructor'), 'shows that are not featured stay in the archive');
  assert.ok(!v.episodes.some((e) => e.id === 'ep-sv-5'), 'scheduled episodes wait for their date');
  assert.ok(stationView(doc, '2026-11-05').episodes.some((e) => e.id === 'ep-sv-5'), '...and appear on it');
  const s2 = v.archive.find((a) => a.show.id === 'pod-stem-voices').seasons.find((s) => s.season.number === 2);
  assert.deepEqual(s2.episodes.map((e) => e.number), [1, 2]);

  assert.equal(nextNumber(doc, 'pod-stem-voices', 2), 4);
  assert.equal(nextNumber(doc, 'pod-stem-voices', 3), 1, 'a new season starts at 1');
  assert.equal(nextNumber(doc, 'pod-stem-voices', 1), 3, 'trailers do not take a number');
});

test('podcasts: drafts and scheduled episodes stay out of the feed; uploads are .mp3 or .wav', () => {
  const doc = seedPodcasts();
  doc.episodes['ep-draft'] = { ...doc.episodes['ep-sv-4'], id: 'ep-draft', title: 'Unfinished', status: 'draft', publishedAt: '2026-01-01', audio: { mediaId: 'media_x', duration: 90, mimetype: 'audio/wav' } };
  const rss = podcastRss(doc, 'pod-stem-voices', { today: '2026-10-25' });
  assert.match(rss, /<rss version="2.0"/);
  assert.equal((rss.match(/<item>/g) ?? []).length, 5);
  assert.ok(!rss.includes('Mentors who look like you'), 'scheduled');
  assert.ok(!rss.includes('Unfinished'), 'draft');
  assert.match(rss, /<itunes:season>2<\/itunes:season>/);
  assert.equal(published(doc.episodes['ep-draft'], '2099-01-01'), false, 'a draft is never live');
  const withUpload = podcastRss({ ...doc, episodes: { u: { ...doc.episodes['ep-draft'], status: 'published' } } }, 'pod-stem-voices', { audioUrl: (e) => `https://cdn.example/${e.audio.mediaId}.wav` });
  assert.match(withUpload, /url="https:\/\/cdn.example\/media_x.wav" type="audio\/wav"/);
  assert.ok(isAudioFile({ name: 'ep1.WAV', type: '' }) && isAudioFile({ name: 'x', type: 'audio/mpeg' }));
  assert.ok(!isAudioFile({ name: 'notes.m4a', type: 'audio/mp4' }));
});

test('migratePodcasts brings older station documents up to date', () => {
  const old = { station: { name: 'Old' }, podcasts: { p: { id: 'p', title: 'P' } }, episodes: { e: { id: 'e', podcastId: 'p', season: 3, number: 1, publishedAt: '2025-01-01', status: 'published' } }, schedule: {} };
  const doc = migratePodcasts(old);
  assert.equal(doc.station.look.player, 'card');
  assert.equal(doc.podcasts.p.featured, false);
  assert.ok(doc.podcasts.p.seasons[3], 'seasons used by episodes are created');
});

test('pages: what each site shows, and unique addresses', () => {
  const doc = seedPages();
  const org = seedOrg();
  for (const p of Object.values(doc.pages)) assert.ok(org.sites[p.siteId] && (!p.authorId || org.staff[p.authorId]), p.id);
  const c = siteContent(doc, 'site-main', '2026-10-25');
  assert.deepEqual(c.nav.map((p) => p.slug), ['about-us', 'get-involved']);
  assert.deepEqual(c.articles.map((p) => p.id), ['pg-news-equity', 'pg-news-podcast'], 'newest first, drafts left out');
  assert.equal(c.bySlug('learning-with-the-land-what-we-heard'), null, 'drafts have no public address');
  assert.equal(siteContent(doc, 'site-impact', '2026-10-25').nav.length, 0);
  assert.equal(uniqueSlug(doc, 'About us', 'site-main'), 'about-us-2');
  assert.equal(uniqueSlug(doc, 'About us', 'site-impact'), 'about-us');
  assert.equal(uniqueSlug(doc, 'About us', 'site-main', 'pg-about'), 'about-us', 'a page keeps its own address');
  // Every embed in the seeds points at something real.
  const pods = seedPodcasts();
  const dashes = seedDashboards(migrateStrategy(seedRiverbendStrategy())).dashboards;
  for (const p of Object.values(doc.pages)) for (const e of embedsIn(p.body)) {
    if (e.kind === 'episode') assert.ok(pods.episodes[e.id], e.id);
  }
  assert.ok(embedsIn(seedRiverbendPages().pages['pg-about'].body).every((e) => e.kind !== 'dashboard' || dashes[e.id]));
});

test('page markdown: blocks, inline marks, embeds, and no unsafe links', () => {
  const blocks = parseMarkdown('# Title\n\nOne **bold** and _soft_ line\nstill the same paragraph.\n\n- a\n- b\n1. first\n\n[[dashboard:dash-equity]]\n[[nope:x]]\n> quoted\n---');
  assert.deepEqual(blocks.map((b) => b.t), ['h', 'p', 'ul', 'ol', 'embed', 'p', 'quote', 'hr']);
  assert.equal(blocks[0].level, 2, '# is the page’s first heading under the title');
  assert.deepEqual(blocks[1].c.map((n) => n.t), ['text', 'b', 'text', 'i', 'text']);
  assert.match(blocks[1].c.at(-1).v, /line still the same/);
  assert.deepEqual(blocks[4], { t: 'embed', kind: 'dashboard', id: 'dash-equity' });
  assert.equal(blocks[5].c[0].v, '[[nope:x]]', 'unknown shortcodes stay as text');
  assert.deepEqual(parseInline('snake_case_name'), [{ t: 'text', v: 'snake_case_name' }]);
  assert.deepEqual(parseInline('[site](site.html?site=a&view=news)')[0], { t: 'a', href: 'site.html?site=a&view=news', c: [{ t: 'text', v: 'site' }] });
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x']) assert.equal(safeHref(bad), null, bad);
  assert.ok(parseInline('[x](javascript:alert)').every((n) => n.t === 'text'));
  assert.equal(plainText('## Hi\n\n**Bold** move'), 'Hi Bold move');
});

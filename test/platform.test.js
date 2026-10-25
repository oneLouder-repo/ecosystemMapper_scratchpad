import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrg, seedRiverbend, blankOrg, migrateOrg, pluginOn } from '../src/platform/org.js';
import { PALETTES, SHAPES } from '../src/platform/themes.js';
import { PLUGINS, enabledPlugins } from '../src/plugins.js';
import { mapEntry, mapsFor } from '../src/platform/maps.js';
import { seedRadio, episodesOf, onAir, nextSlot, podcastRss, published } from '../src/platform/radio.js';
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
  assert.equal(pluginOn(seedRiverbend(), 'radio'), false);
  assert.ok(!enabledPlugins(seedRiverbend()).some((p) => p.id === 'radio'));
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

test('radio: episodes, the weekly programme and the RSS feed', () => {
  const radio = seedRadio();
  const org = seedOrg();
  for (const p of Object.values(radio.podcasts)) for (const id of p.hostIds) assert.ok(org.staff[id], `host ${id}`);
  const eps = episodesOf(radio, 'pod-stem-voices');
  assert.deepEqual(eps.map((e) => e.number), [3, 2, 1, 0], 'newest first');
  // Monday 2026-10-26 at 08:30 is the STEM Voices slot.
  assert.equal(onAir(radio, new Date(2026, 9, 26, 8, 30))?.podcastId, 'pod-stem-voices');
  assert.equal(onAir(radio, new Date(2026, 9, 26, 12, 0)), null);
  assert.equal(nextSlot(radio, new Date(2026, 9, 26, 12, 0))?.id, 'slot-2');
  const rss = podcastRss(radio, 'pod-stem-voices', { today: '2026-10-25' });
  assert.match(rss, /<rss version="2.0"/);
  assert.equal((rss.match(/<item>/g) ?? []).length, eps.filter((e) => published(e, '2026-10-25')).length);
  assert.ok(!rss.includes('Girls who build bridges'), 'scheduled episodes stay out of the feed');
});

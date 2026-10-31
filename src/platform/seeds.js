/**
 * The example orgs' starting documents. Pure functions, so the browser
 * (platform/docs.js, seeding on first use) and the server (seeding a new
 * database) build exactly the same examples.
 */
import { seedOrg, seedRiverbend } from './org.js';
import { seedStrategy, seedRiverbendStrategy } from './strategySeed.js';
import { measureIndex, migrateStrategy } from './strategy.js';
import { seedData } from './data.js';
import { seedDashboards } from './dashboards.js';
import { seedPodcasts } from './podcasts.js';
import { seedPages, seedRiverbendPages } from './pages.js';
import { mapEntry, mapDocName } from './maps.js';
import { createMap } from '../core/ops.js';
import { seedMap } from '../seed.js';
import { seedStudio } from './studio.js';

const exampleMaps = () => {
  const main = { ...seedMap(), id: 'map-ecosystem' };
  const spheres = { ...createMap({ name: 'Indigenous partnerships', lensId: 'spheres-of-systems-change' }), id: 'map-indigenous' };
  return {
    index: { maps: {
      'map-ecosystem': mapEntry({ id: 'map-ecosystem', title: 'National STEM outreach ecosystem', description: 'Everyone shaping STEM outreach for youth in Canada, and how they relate.', ownerId: 's-ed', memberIds: ['s-indig', 's-part', 's-eval', 's-prog'] }),
      'map-indigenous': mapEntry({ id: 'map-indigenous', title: 'Indigenous partnerships', description: 'A working map for the co-design sessions.', ownerId: 's-indig', memberIds: ['s-ed', 's-train'] }),
    } },
    contents: { 'map-ecosystem': main, 'map-indigenous': spheres },
  };
};

export const SEEDS = {
  'org-example': { org: seedOrg, strategy: seedStrategy, maps: exampleMaps, podcasts: seedPodcasts, pages: seedPages },
  'org-riverbend': {
    org: seedRiverbend,
    strategy: seedRiverbendStrategy,
    maps: () => {
      const map = { ...createMap({ name: 'Riverbend food system', lensId: 'water-of-systems-change' }), id: 'map-food' };
      return { index: { maps: { 'map-food': mapEntry({ id: 'map-food', title: 'Riverbend food system', ownerId: 'r-lead', memberIds: ['r-vol'] }) } }, contents: { 'map-food': map } };
    },
    pages: seedRiverbendPages,
  },
};
/** Every document of an example org, by name (null for any other org). */
export function exampleDocs(orgId) {
  const seed = SEEDS[orgId];
  if (!seed) return null;
  const strategy = migrateStrategy(seed.strategy());
  const maps = seed.maps();
  const docs = {
    org: seed.org(),
    strategy,
    data: seedData(Object.keys(measureIndex(strategy))),
    dashboards: seedDashboards(strategy),
    pages: seed.pages(),
    maps: maps.index,
  };
  if (seed.podcasts) docs.podcasts = seed.podcasts();
  docs.studio = seedStudio(strategy, { staff: Object.keys(docs.org.staff) });
  for (const [id, map] of Object.entries(maps.contents)) docs[mapDocName(id)] = map;
  return docs;
}

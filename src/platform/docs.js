/**
 * One place to load every document of the open org, so plugins can read
 * each other's data: the strategy can show map actors as assets,
 * dashboards read strategy measures and program data, the public site
 * reads all of them.
 *
 * Example orgs get example data; any other org starts empty.
 */
import { loadOrSeed, saveDoc, activeOrg } from './storage.js';
import './session.js';
import { blankOrg, migrateOrg } from './org.js';
import { migrateStrategy, measureIndex } from './strategy.js';
import { blankStrategy } from './strategySeed.js';
import { seedData } from './data.js';
import { seedDashboards } from './dashboards.js';
import { blankPodcasts, migratePodcasts } from './podcasts.js';
import { loadPages as loadPagesFor } from './pages.js';
import { loadMapIndex, loadAllMaps } from './maps.js';
import { SEEDS } from './seeds.js';

const seedFor = (doc) => SEEDS[activeOrg()]?.[doc];

export const loadOrg = () => migrateOrg(loadOrSeed('org', seedFor('org') ?? (() => blankOrg({ id: activeOrg(), name: 'New org' }))));
export const loadStrategy = () => migrateStrategy(loadOrSeed('strategy', seedFor('strategy') ?? blankStrategy));
export const loadData = () => loadOrSeed('data', () => seedData(Object.keys(measureIndex(loadStrategy()))));
export const loadDashboards = () => loadOrSeed('dashboards', () => seedDashboards(loadStrategy()));
export const loadPodcasts = () => migratePodcasts(loadOrSeed('podcasts', seedFor('podcasts') ?? blankPodcasts));
export const loadPages = () => loadPagesFor(activeOrg());
export const loadMaps = () => loadMapIndex(seedFor('maps'));

export function loadAll() {
  const maps = loadMaps();
  return {
    org: loadOrg(),
    strategy: loadStrategy(),
    data: loadData(),
    dashboards: loadDashboards(),
    maps,
    mapContents: loadAllMaps(maps),
    podcasts: loadPodcasts(),
    pages: loadPages(),
  };
}

export { saveDoc };

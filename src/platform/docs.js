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
import { seedOrg, seedRiverbend, blankOrg, migrateOrg } from './org.js';
import { migrateStrategy, measureIndex } from './strategy.js';
import { seedStrategy, seedRiverbendStrategy, blankStrategy } from './strategySeed.js';
import { seedData } from './data.js';
import { seedDashboards } from './dashboards.js';
import { seedRadio, blankRadio } from './radio.js';
import { loadMapIndex, loadAllMaps, mapEntry } from './maps.js';
import { createMap } from '../core/ops.js';
import { seedMap } from '../seed.js';

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

const SEEDS = {
  'org-example': { org: seedOrg, strategy: seedStrategy, maps: exampleMaps, radio: seedRadio },
  'org-riverbend': {
    org: seedRiverbend,
    strategy: seedRiverbendStrategy,
    maps: () => {
      const map = { ...createMap({ name: 'Riverbend food system', lensId: 'water-of-systems-change' }), id: 'map-food' };
      return { index: { maps: { 'map-food': mapEntry({ id: 'map-food', title: 'Riverbend food system', ownerId: 'r-lead', memberIds: ['r-vol'] }) } }, contents: { 'map-food': map } };
    },
  },
};
const seedFor = (doc) => SEEDS[activeOrg()]?.[doc];

export const loadOrg = () => migrateOrg(loadOrSeed('org', seedFor('org') ?? (() => blankOrg({ id: activeOrg(), name: 'New org' }))));
export const loadStrategy = () => migrateStrategy(loadOrSeed('strategy', seedFor('strategy') ?? blankStrategy));
export const loadData = () => loadOrSeed('data', () => seedData(Object.keys(measureIndex(loadStrategy()))));
export const loadDashboards = () => loadOrSeed('dashboards', () => seedDashboards(loadStrategy()));
export const loadRadio = () => loadOrSeed('radio', seedFor('radio') ?? blankRadio);
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
    radio: loadRadio(),
  };
}

export { saveDoc };

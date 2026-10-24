/**
 * One place to load every tool's document, so tools can read each other's
 * data: the strategy can show map actors as assets, dashboards can read
 * strategy measures and program data, and so on.
 */
import { loadOrSeed, saveDoc } from './storage.js';
import { seedOrg } from './org.js';
import { migrateStrategy } from './strategy.js';
import { seedStrategy } from './strategySeed.js';
import { seedData } from './data.js';
import { seedDashboards } from './dashboards.js';
import { loadLocal, saveLocal } from '../persistence/local.js';
import { seedMap } from '../seed.js';

export const loadOrg = () => loadOrSeed('org', seedOrg);
export const loadStrategy = () => migrateStrategy(loadOrSeed('strategy', seedStrategy));
export const loadData = () => loadOrSeed('data', seedData);
export const loadDashboards = () => loadOrSeed('dashboards', () => seedDashboards(loadStrategy()));

/** The ecosystem map. Saved on first load so other tools can refer to its actors by id. */
export function loadMap() {
  const existing = loadLocal();
  if (existing) return existing;
  const map = seedMap();
  saveLocal(map);
  return map;
}

export function loadAll() {
  return { org: loadOrg(), strategy: loadStrategy(), data: loadData(), dashboards: loadDashboards(), map: loadMap() };
}

export { saveDoc };

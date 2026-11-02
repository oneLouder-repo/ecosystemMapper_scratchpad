import { createMap, uid } from '../core/ops.js';
import { loadDoc, loadOrSeed, saveDoc } from './storage.js';

/**
 * Ecosystem maps. An org can have many maps; each is its own document so a
 * big map never slows down the others, and the index says who owns and
 * belongs to each.
 *
 *   maps            { maps: { [id]: MapEntry } }        the index
 *   map/<id>        the map itself (actors, connectors, groups, layers, lensId; see core/ops.js)
 *
 * MapEntry { id, title, description, ownerId, memberIds: [staff ids], createdAt, updatedAt }
 *
 * Other plugins point at a map's actors by { mapId, ref: actorId } (see assets.js).
 */
export const mapDocName = (id) => `map/${id}`;

export function mapEntry({ id = uid('map'), title = 'Untitled map', description = '', ownerId = null, memberIds = [] } = {}) {
  const now = new Date().toISOString().slice(0, 10);
  return { id, title, description, ownerId, memberIds, createdAt: now, updatedAt: now };
}

/** The index of maps, seeding it (and each seeded map) the first time. */
export function loadMapIndex(seed = () => ({ index: { maps: {} }, contents: {} })) {
  const index = loadDoc('maps');
  if (index) return index;
  const fresh = seed();
  for (const [id, map] of Object.entries(fresh.contents)) saveDoc(mapDocName(id), map, undefined, { quiet: true });
  saveDoc('maps', fresh.index, undefined, { quiet: true });
  return fresh.index;
}

export const loadMapContent = (id) => loadOrSeed(mapDocName(id), () => createMap({ name: 'Untitled map' }));

/** Every map's contents, by map id, for plugins that read actors across maps. */
export function loadAllMaps(index) {
  return Object.fromEntries(Object.keys(index.maps).map((id) => [id, loadMapContent(id)]));
}

/** Make a new map, save it, and return its entry. */
export function createMapIn(index, { title, ownerId, lensId, content }) {
  const entry = mapEntry({ title, ownerId, memberIds: [] });
  const map = content ?? createMap({ name: title, lensId });
  map.id = entry.id;
  map.name = title;
  index.maps[entry.id] = entry;
  saveDoc(mapDocName(entry.id), map);
  saveDoc('maps', index);
  return entry;
}

/** Maps a person owns or belongs to. */
export const mapsFor = (index, staffId) =>
  Object.values(index.maps).filter((m) => m.ownerId === staffId || m.memberIds.includes(staffId));

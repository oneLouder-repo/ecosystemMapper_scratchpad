/**
 * Dashi ecosystem map files: one JSON file per map, for keeping maps
 * offline, archiving them, or moving them between organisations.
 *
 *   {
 *     "format": "dashi.ecosystem-map",
 *     "version": 1,
 *     "savedAt": "2026-11-01T10:00:00.000Z",
 *     "source": { "org": "Coastal Climate Research Alliance", "app": "Dashi Ecosystem Mapper" },
 *     "entry": { "title": "Coastal ecosystem", "description": "…" },
 *     "map": { lensId, layers, actors, connectors, groups, notes, … }
 *   }
 *
 * Older exports were the bare map object; those still open.
 */
export const MAP_FORMAT = 'dashi.ecosystem-map';
export const MAP_FORMAT_VERSION = 1;

export function mapFile(map, { entry = {}, org } = {}) {
  return {
    format: MAP_FORMAT,
    version: MAP_FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    source: { org: org?.name ?? null, app: 'Dashi Ecosystem Mapper' },
    entry: { title: entry.title ?? map.name ?? 'Untitled map', description: entry.description ?? '' },
    map,
  };
}

export function fileName(title) {
  return `${(title || 'map').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'map'}.dashi-map.json`;
}

export function exportMap(map, opts = {}) {
  const file = mapFile(map, opts);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName(file.entry.title);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Read a map file (or an older bare map). Returns { map, entry }. */
export function parseMapFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('it isn’t a JSON file'); }
  if (data?.format && data.format !== MAP_FORMAT) throw new Error(`it is a ${data.format} file, not an ecosystem map`);
  if (data?.format && data.version > MAP_FORMAT_VERSION) throw new Error('it was saved by a newer version of Dashi');
  const map = data?.format ? data.map : data;
  if (!map || typeof map.actors !== 'object' || typeof map.connectors !== 'object' || !Array.isArray(map.layers)) {
    throw new Error('it is not an ecosystem map');
  }
  const entry = data?.format ? { title: data.entry?.title || map.name, description: data.entry?.description ?? '' } : { title: map.name, description: '' };
  return { map, entry };
}

export async function importMap(file) {
  return parseMapFile(await file.text());
}

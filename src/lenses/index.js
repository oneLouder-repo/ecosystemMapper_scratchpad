/**
 * Lens registry. A lens is one JSON file in this folder: add the file,
 * then add its id to LENS_FILES.
 *
 * A lens never changes map data. It supplies the backdrop (regions), the
 * actor categories and the connector types. Actors whose category the
 * active lens doesn't define keep it and show as "unmapped".
 */
export const LENS_FILES = ['micro-meso-macro', 'water-of-systems-change'];

export async function loadLenses() {
  const lenses = new Map();
  for (const name of LENS_FILES) {
    const res = await fetch(new URL(`./${name}.json`, import.meta.url));
    const lens = prepareLens(await res.json());
    lenses.set(lens.id, lens);
  }
  return lenses;
}

export function prepareLens(lens) {
  lens.categoryById = Object.fromEntries(lens.actorCategories.map((c) => [c.id, c]));
  lens.typeById = Object.fromEntries(lens.connectorTypes.map((t) => [t.id, t]));
  lens.defaultCategory ??= lens.actorCategories.at(-1).id;
  lens.defaultConnectorType ??= lens.connectorTypes[0].id;
  return lens;
}

/** Layout geometry. Add a new layout by adding an entry here and a renderer in LensView. */
export const layouts = {
  bands: {
    regionAt(lens, x, y) {
      const i = Math.floor(y / lens.bandHeight);
      return lens.regions[i] ?? null;
    },
  },
};

export function regionAt(lens, x, y) {
  return layouts[lens.layout]?.regionAt(lens, x, y) ?? null;
}

/**
 * Lens registry. A lens is one JSON file in this folder: add the file,
 * then add its id to LENS_FILES.
 *
 * A lens never changes map data. It supplies the backdrop (regions), the
 * actor categories and the connector types. Actors whose category the
 * active lens doesn't define keep it and show as "unmapped". An actor's
 * region is worked out from its position, so dragging it to a new place
 * moves it to a new region, and switching lens re-reads it.
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

/**
 * Layout geometry, one entry per `layout` value in a lens file.
 *   regionAt(lens, x, y)  the region containing a point, or null
 *   bounds(lens)          { x, y, w, h } of the whole backdrop, for fitting the view
 * Add a layout here and a matching renderer in display/LensView.js.
 */
export const layouts = {
  /** Horizontal tiers, top to bottom. Needs `bandHeight`. */
  bands: {
    regionAt(lens, x, y) {
      return lens.regions[Math.floor(y / lens.bandHeight)] ?? null;
    },
    bounds(lens) {
      return { x: 0, y: 0, w: 1200, h: lens.regions.length * lens.bandHeight };
    },
  },

  /** Concentric circles, regions listed inside out, each with a `radius`. Needs `center`. */
  rings: {
    regionAt(lens, x, y) {
      const d = Math.hypot(x - lens.center.x, y - lens.center.y);
      return lens.regions.find((r) => d <= r.radius) ?? null;
    },
    bounds(lens) {
      const r = lens.regions.at(-1).radius;
      return { x: lens.center.x - r, y: lens.center.y - r, w: 2 * r, h: 2 * r };
    },
  },

  /** An inverted triangle cut into equal-height bands, regions listed top to bottom. Needs `triangle`. */
  triangle: {
    regionAt(lens, x, y) {
      const { centerX, top, bottom, halfWidth } = lens.triangle;
      if (y < top || y > bottom) return null;
      if (Math.abs(x - centerX) > (halfWidth * (bottom - y)) / (bottom - top)) return null;
      const i = Math.min(lens.regions.length - 1, Math.floor(((y - top) / (bottom - top)) * lens.regions.length));
      return lens.regions[i];
    },
    bounds(lens) {
      const { centerX, top, bottom, halfWidth } = lens.triangle;
      return { x: centerX - halfWidth, y: top, w: 2 * halfWidth, h: bottom - top };
    },
  },
};

export function regionAt(lens, x, y) {
  return layouts[lens.layout]?.regionAt(lens, x, y) ?? null;
}

export function lensBounds(lens) {
  return layouts[lens.layout]?.bounds(lens) ?? { x: 0, y: 0, w: 1200, h: 900 };
}

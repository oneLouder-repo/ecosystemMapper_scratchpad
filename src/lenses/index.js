/**
 * Lenses: swappable systems models drawn behind the map.
 *
 * A lens is one JSON file in this folder: add the file, then add its id to
 * LENS_FILES. A lens supplies a `layout` and ordered `regions`. Actor
 * categories and connector types come from the shared taxonomy.json, so an
 * actor means the same thing whichever lens is showing (a lens may still
 * override them with its own `actorCategories` / `connectorTypes`).
 *
 * Ordinality: every region has a `depth` range on one shared scale, from
 * 0 (explicit, structural, collective: the surface) to 1 (implicit,
 * personal, mental models: the deep end). Actors are stored as
 * place = { depth, spread } rather than x/y, and each layout projects that
 * place onto its own shape. So an actor in the Micro ring (depth 0.67–1)
 * lands in Transformative change (also 0.67–1) when the lens switches.
 * `spread` (-1…1) is the other direction: around the ring, across the
 * triangle or band, or along the columns of a grid.
 */
export const LENS_FILES = [
  'micro-meso-macro',
  'water-of-systems-change',
  'spheres-of-systems-change',
  'leverage-points',
  'theory-of-system-change',
];

export async function loadLenses() {
  const taxonomy = await (await fetch(new URL('./taxonomy.json', import.meta.url))).json();
  const lenses = new Map();
  for (const name of LENS_FILES) {
    const res = await fetch(new URL(`./${name}.json`, import.meta.url));
    const lens = prepareLens(await res.json(), taxonomy);
    lenses.set(lens.id, lens);
  }
  return lenses;
}

export function prepareLens(lens, taxonomy = {}) {
  lens.actorCategories ??= taxonomy.actorCategories ?? [];
  lens.connectorTypes ??= taxonomy.connectorTypes ?? [];
  lens.defaultCategory ??= taxonomy.defaultCategory ?? lens.actorCategories.at(-1)?.id;
  lens.defaultConnectorType ??= taxonomy.defaultConnectorType ?? lens.connectorTypes[0]?.id;
  lens.categoryById = Object.fromEntries(lens.actorCategories.map((c) => [c.id, c]));
  lens.typeById = Object.fromEntries(lens.connectorTypes.map((t) => [t.id, t]));
  return lens;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** The region whose depth range holds `depth`. */
export function regionForDepth(lens, depth) {
  const d = clamp(depth, 0, 1);
  return lens.regions.find((r) => d >= r.depth[0] && d <= r.depth[1]) ?? null;
}

/** Position within a region's depth range, 0 at its shallow edge and 1 at its deep edge. */
const within = (region, d) => (clamp(d, region.depth[0], region.depth[1]) - region.depth[0]) / (region.depth[1] - region.depth[0] || 1);
const depthAt = (region, t) => region.depth[0] + clamp(t, 0, 1) * (region.depth[1] - region.depth[0]);

/**
 * Layout geometry, one entry per `layout` value in a lens file.
 *   project(lens, place)     → { x, y } on the board
 *   unproject(lens, x, y)    → place { depth, spread }, clamped onto the lens
 *   bounds(lens)             → { x, y, w, h } of the backdrop, for fitting the view
 *   bandsOf(lens)            → per-region geometry, used by LensView to draw
 * Add a layout here and a matching renderer in display/LensView.js.
 */
export const layouts = {
  /** Concentric circles. Regions are listed inside out, each with an outer `radius`. */
  rings: {
    bandsOf(lens) {
      return lens.regions.map((region, i) => ({ region, inner: i ? lens.regions[i - 1].radius : 0, outer: region.radius }));
    },
    project(lens, { depth, spread }) {
      const band = this.bandsOf(lens).find((b) => b.region === regionForDepth(lens, depth));
      const r = band.outer - within(band.region, depth) * (band.outer - band.inner);
      const angle = clamp(spread, -1, 1) * Math.PI;
      return { x: lens.center.x + r * Math.sin(angle), y: lens.center.y - r * Math.cos(angle) };
    },
    unproject(lens, x, y) {
      const dx = x - lens.center.x;
      const dy = y - lens.center.y;
      const bands = this.bandsOf(lens);
      const r = Math.min(Math.hypot(dx, dy), bands.at(-1).outer);
      const band = bands.find((b) => r <= b.outer);
      const t = (band.outer - r) / (band.outer - band.inner || 1);
      return { depth: depthAt(band.region, t), spread: Math.atan2(dx, -dy) / Math.PI };
    },
    bounds(lens) {
      const r = lens.regions.at(-1).radius;
      return { x: lens.center.x - r, y: lens.center.y - r, w: 2 * r, h: 2 * r };
    },
  },

  /** An inverted triangle cut into equal-height bands, regions listed top to bottom. */
  triangle: {
    bandsOf(lens) {
      const { top, bottom } = lens.triangle;
      const h = (bottom - top) / lens.regions.length;
      return lens.regions.map((region, i) => ({ region, y0: top + i * h, y1: top + (i + 1) * h }));
    },
    halfWidthAt(lens, y) {
      const { top, bottom, halfWidth } = lens.triangle;
      return (halfWidth * (bottom - y)) / (bottom - top);
    },
    project(lens, { depth, spread }) {
      const band = this.bandsOf(lens).find((b) => b.region === regionForDepth(lens, depth));
      const y = band.y0 + within(band.region, depth) * (band.y1 - band.y0);
      return { x: lens.triangle.centerX + clamp(spread, -1, 1) * this.halfWidthAt(lens, y), y };
    },
    unproject(lens, x, y) {
      const { top, bottom, centerX } = lens.triangle;
      const cy = clamp(y, top, bottom);
      const band = this.bandsOf(lens).find((b) => cy <= b.y1) ?? this.bandsOf(lens).at(-1);
      const hw = Math.max(1, this.halfWidthAt(lens, cy));
      return { depth: depthAt(band.region, (cy - band.y0) / (band.y1 - band.y0)), spread: clamp((x - centerX) / hw, -1, 1) };
    },
    bounds(lens) {
      const { centerX, top, bottom, halfWidth } = lens.triangle;
      return { x: centerX - halfWidth, y: top, w: 2 * halfWidth, h: bottom - top };
    },
  },

  /** Horizontal bands of `bandHeight`, `width` wide, centred on the origin, regions top to bottom. */
  bands: {
    bandsOf(lens) {
      const top = (-lens.regions.length * lens.bandHeight) / 2;
      return lens.regions.map((region, i) => ({ region, y0: top + i * lens.bandHeight, y1: top + (i + 1) * lens.bandHeight }));
    },
    project(lens, { depth, spread }) {
      const band = this.bandsOf(lens).find((b) => b.region === regionForDepth(lens, depth));
      return { x: (clamp(spread, -1, 1) * lens.width) / 2, y: band.y0 + within(band.region, depth) * (band.y1 - band.y0) };
    },
    unproject(lens, x, y) {
      const bands = this.bandsOf(lens);
      const cy = clamp(y, bands[0].y0, bands.at(-1).y1);
      const band = bands.find((b) => cy <= b.y1);
      return { depth: depthAt(band.region, (cy - band.y0) / (band.y1 - band.y0)), spread: clamp(x / (lens.width / 2), -1, 1) };
    },
    bounds(lens) {
      const h = lens.regions.length * lens.bandHeight;
      return { x: -lens.width / 2, y: -h / 2, w: lens.width, h };
    },
  },
};

/** Bands with named `columns` across them: rows are depth, columns read along `spread`. */
layouts.grid = {
  ...layouts.bands,
  bounds(lens) {
    const b = layouts.bands.bounds(lens);
    return { ...b, y: b.y - 60, h: b.h + 60 };
  },
};

const layoutOf = (lens) => layouts[lens.layout] ?? layouts.bands;

export const project = (lens, place) => layoutOf(lens).project(lens, place);
export const unproject = (lens, x, y) => layoutOf(lens).unproject(lens, x, y);
export const lensBounds = (lens) => layoutOf(lens).bounds(lens);
export const bandsOf = (lens) => layoutOf(lens).bandsOf(lens);
export const regionAt = (lens, place) => regionForDepth(lens, place.depth);

/** For grid lenses, the column a place falls in. */
export function columnAt(lens, place) {
  if (!lens.columns?.length) return null;
  const i = Math.floor(((clamp(place.spread, -1, 1) + 1) / 2) * lens.columns.length);
  return lens.columns[Math.min(lens.columns.length - 1, i)];
}

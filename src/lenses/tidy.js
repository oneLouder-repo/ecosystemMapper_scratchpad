import { layouts, regionForDepth, columnAt, unproject } from './index.js';

/**
 * Tidy: lay the actors out evenly, each staying in its zone (region) of
 * the lens, and in its column on a grid. Roughly keeps their order (around
 * the ring, or left to right), keeps group members side by side, and keeps
 * clear of the zone labels. Layers are left as they are.
 *
 *   tidyPlaces(lens, actors, { groupOf }) → { [actorId]: place }
 *   actors: [{ id, place, w, h }]
 */
const GAP_X = 20;
const GAP_Y = 22;

export function tidyPlaces(lens, actors, { groupOf = () => null } = {}) {
  const tidy = TIDY[lens.layout] ?? TIDY.bands;
  return tidy(lens, actors, groupOf);
}

/** Sort by a key (angle or left-to-right), but pull each group together at its members' average. */
function ordered(list, key, groupOf) {
  const sums = new Map();
  for (const a of list) {
    const g = groupOf(a.id);
    if (!g) continue;
    const s = sums.get(g) ?? { total: 0, n: 0 };
    s.total += key(a);
    s.n += 1;
    sums.set(g, s);
  }
  const anchor = (a) => {
    const s = sums.get(groupOf(a.id));
    return s ? s.total / s.n : key(a);
  };
  return [...list].sort((a, b) => anchor(a) - anchor(b) || String(groupOf(a.id)).localeCompare(String(groupOf(b.id))) || key(a) - key(b));
}

/** Share `n` items between slots in proportion to how many each can hold, in order. */
function share(n, capacities) {
  const total = capacities.reduce((s, c) => s + c, 0) || 1;
  const counts = capacities.map(() => 0);
  const order = [];
  for (let i = 0; i < n; i++) {
    let best = 0;
    for (let k = 1; k < capacities.length; k++) {
      if (counts[k] / (capacities[k] / total) < counts[best] / (capacities[best] / total)) best = k;
    }
    counts[best]++;
    order.push(best);
  }
  return order;
}

const size = (actors) => ({
  w: Math.max(150, ...actors.map((a) => a.w ?? 150)),
  h: Math.max(58, ...actors.map((a) => a.h ?? 58)),
});

const TIDY = {
  rings(lens, actors, groupOf) {
    const out = {};
    const { w, h } = size(actors);
    const { x: cx, y: cy } = lens.center;
    const placed = [];
    const hits = (pts) => pts.reduce((n, p) => n + placed.filter((q) => Math.abs(p.x - q.x) < w + 6 && Math.abs(p.y - q.y) < h + 6).length, 0);
    for (const band of layouts.rings.bandsOf(lens)) {
      const members = actors.filter((a) => regionForDepth(lens, a.place.depth) === band.region);
      if (!members.length) continue;
      // Rings within the band, a card's width apart (so cards side by side at
      // 3 and 9 o'clock don't touch), from the outer edge inwards. The centre
      // of the innermost disc can hold one more.
      const hi = band.outer - h / 2 - 14;
      const lo = band.inner ? band.inner + h / 2 + 14 : 0;
      const radii = [];
      for (let r = hi; r >= lo - 1 && r > 0; r -= w + GAP_X) radii.push(r);
      if (!band.inner && (radii.at(-1) ?? hi) > w + GAP_X) radii.push(0);
      if (!radii.length) radii.push((band.inner + band.outer) / 2);
      // Leave the top of each ring clear for its label.
      const gapOf = (r) => (r ? Math.min(0.8, 80 / r) : 0);
      const capOf = (r) => (r ? Math.max(1, Math.floor(((2 * Math.PI - 2 * gapOf(r)) * r) / (w + GAP_X))) : 1);
      // Fill the outer rings first (more room), spilling inwards only as needed.
      let left = members.length;
      const counts = radii.map((r) => { const c = Math.min(left, capOf(r)); left -= c; return c; });
      for (let i = 0; left > 0; i = (i + 1) % radii.length, left--) counts[i]++;
      const used = radii.map((r, i) => ({ r, c: counts[i] })).filter((x) => x.c);
      const angleOf = (a) => ((a.place.spread * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const list = ordered(members, angleOf, groupOf);
      // Each ring takes items from all the way round, so every ring spans the full circle.
      const slot = share(list.length, used.map((x) => x.c));
      const rings = used.map(() => []);
      list.forEach((a, i) => rings[slot[i]].push(a));
      const radiiUsed = used.map((x) => x.r);
      rings.forEach((ring, ri) => {
        if (!ring.length) return;
        const r = radiiUsed[ri];
        const gap = gapOf(r);
        const span = 2 * Math.PI - 2 * gap;
        const at = (shift) => ring.map((_, j) => {
          const angle = gap + ((j + 0.5 + shift) * span) / ring.length;
          return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
        });
        // Turn the ring a little, if that keeps its cards clear of the rings already laid out.
        let best = at(0);
        let fewest = hits(best);
        for (let i = 1; i < 12 && fewest; i++) {
          const pts = at(i / 12 - 0.5);
          const n = hits(pts);
          if (n < fewest) { best = pts; fewest = n; }
        }
        ring.forEach((a, j) => { out[a.id] = unproject(lens, best[j].x, best[j].y); });
        placed.push(...best);
      });
    }
    return out;
  },

  triangle(lens, actors, groupOf) {
    const out = {};
    const { w, h } = size(actors);
    const tri = layouts.triangle;
    for (const band of tri.bandsOf(lens)) {
      const members = actors.filter((a) => regionForDepth(lens, a.place.depth) === band.region);
      if (!members.length) continue;
      // Rows below the zone's label (centred at its top).
      const top = band.y0 + 78 + h / 2;
      const bottom = band.y1 - h / 2 - 10;
      const n = Math.max(1, Math.floor((bottom - top) / (h + GAP_Y)) + 1);
      const ys = n === 1 ? [(top + bottom) / 2] : Array.from({ length: n }, (_, i) => top + ((bottom - top) * i) / (n - 1));
      const half = (y) => Math.max(w / 2, tri.halfWidthAt(lens, y + h / 2) - 24);
      const caps = ys.map((y) => Math.max(1, Math.floor((2 * half(y)) / (w + GAP_X))));
      const list = ordered(members, (a) => a.place.spread, groupOf);
      const slot = share(list.length, caps);
      const rows = ys.map(() => []);
      list.forEach((a, i) => rows[slot[i]].push(a));
      rows.forEach((row, ri) => {
        const y = ys[ri];
        const hw = half(y);
        row.forEach((a, j) => {
          const x = lens.triangle.centerX - hw + (2 * hw * (j + 0.5)) / row.length;
          out[a.id] = unproject(lens, x, y);
        });
      });
    }
    return out;
  },

  bands(lens, actors, groupOf) {
    const out = {};
    const { w, h } = size(actors);
    const left = -lens.width / 2;
    const columns = lens.layout === 'grid' ? lens.columns : null;
    for (const band of layouts.bands.bandsOf(lens)) {
      const members = actors.filter((a) => regionForDepth(lens, a.place.depth) === band.region);
      if (!members.length) continue;
      const cells = columns
        ? columns.map((col, i) => ({ col, x0: left + (i * lens.width) / columns.length + 16, x1: left + ((i + 1) * lens.width) / columns.length - 16 }))
        : [{ col: null, x0: left + 300, x1: -left - 170 }];
      // Grids keep the top of each band for its label; plain bands keep the left.
      const top = band.y0 + (columns ? 58 : 6) + h / 2;
      const bottom = band.y1 - 6 - h / 2;
      const nRows = Math.max(1, Math.floor((bottom - top) / (h + GAP_Y)) + 1);
      for (const cell of cells) {
        const inCell = members.filter((a) => !cell.col || columnAt(lens, a.place)?.id === cell.col.id);
        if (!inCell.length) continue;
        let perRow = Math.max(1, Math.floor((cell.x1 - cell.x0 + GAP_X) / (w + GAP_X)));
        // Too many to fit beside the zone's label: use the band's full width.
        if (!cell.col && inCell.length > perRow * nRows) {
          cell.x0 = left + 16;
          cell.x1 = -left - 16;
          perRow = Math.max(1, Math.floor((cell.x1 - cell.x0 + GAP_X) / (w + GAP_X)));
        }
        const used = Math.min(nRows, Math.ceil(inCell.length / perRow));
        const ys = used === 1 ? [(top + bottom) / 2] : Array.from({ length: used }, (_, i) => top + ((bottom - top) * i) / (used - 1));
        const list = ordered(inCell, (a) => a.place.spread, groupOf);
        const rows = ys.map(() => []);
        // Fill row by row, so left-to-right order reads across each row.
        const per = Math.ceil(list.length / used);
        list.forEach((a, i) => rows[Math.min(used - 1, Math.floor(i / per))].push(a));
        rows.forEach((row, ri) => {
          const span = cell.x1 - cell.x0;
          row.forEach((a, j) => {
            const x = cell.x0 + (span * (j + 0.5)) / row.length;
            out[a.id] = unproject(lens, x, ys[ri]);
          });
        });
      }
    }
    return out;
  },
};
TIDY.grid = TIDY.bands;

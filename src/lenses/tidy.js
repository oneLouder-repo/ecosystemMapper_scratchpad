import { layouts, regionForDepth, columnAt, unproject, project } from './index.js';

/**
 * Tidy: clear up overlapping actors, each staying in its zone (region) of
 * the lens, and in its column on a grid, clear of the zone labels. On
 * rings, actors are spread evenly round each ring (keeping their order
 * and keeping group members side by side). On linear lenses they keep
 * their depth and place along the zone and are only nudged apart.
 * Layers are left as they are.
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

  // Linear lenses (bands, grids, the triangle): keep each actor where it is,
  // so its depth within the zone and its place along the zone survive, and
  // nudge cards apart until they no longer overlap, inside their zone.
  triangle: (lens, actors) => declutter(lens, actors),
  bands: (lens, actors) => declutter(lens, actors),
};
TIDY.grid = TIDY.bands;

/** The box an actor's centre may move in: its zone (and grid column), clear of the zone's labels. */
function boundsFor(lens, a, w, h, crowded) {
  const pad = 6;
  if (lens.layout === 'triangle') {
    const band = layouts.triangle.bandsOf(lens).find((b) => b.region === regionForDepth(lens, a.place.depth));
    const top = band.y0 + (crowded ? 8 : 74) + h / 2;
    const bottom = Math.max(top, band.y1 - h / 2 - pad);
    return {
      y0: top, y1: bottom,
      x: (y) => {
        const hw = Math.max(0, layouts.triangle.halfWidthAt(lens, y + h / 2) - w / 2 - 16);
        return [lens.triangle.centerX - hw, lens.triangle.centerX + hw];
      },
    };
  }
  const band = layouts.bands.bandsOf(lens).find((b) => b.region === regionForDepth(lens, a.place.depth));
  const left = -lens.width / 2;
  let x0 = left + w / 2 + 16;
  let x1 = -left - w / 2 - 16;
  let top = band.y0 + h / 2 + pad;
  if (lens.columns?.length) {
    const col = columnAt(lens, a.place);
    const i = lens.columns.indexOf(col);
    const step = lens.width / lens.columns.length;
    x0 = left + i * step + w / 2 + 10;
    x1 = left + (i + 1) * step - w / 2 - 10;
    if (!crowded) top = band.y0 + 56 + h / 2;
  } else if (!crowded) {
    x0 = left + 290 + w / 2;
    x1 = -left - 160 - w / 2;
  }
  const bottom = Math.max(top, band.y1 - h / 2 - pad);
  return { y0: Math.min(top, bottom), y1: bottom, x: () => [x0, Math.max(x0, x1)] };
}

function declutter(lens, actors) {
  const { w, h } = size(actors);
  const zoneOf = (a) => `${regionForDepth(lens, a.place.depth)?.id}|${columnAt(lens, a.place)?.id ?? ''}`;
  // A zone is crowded when its cards wouldn't fit beside its label: then they may use the whole zone.
  const perZone = new Map();
  for (const a of actors) perZone.set(zoneOf(a), (perZone.get(zoneOf(a)) ?? 0) + 1);
  const items = actors.map((a) => {
    const p = project(lens, a.place);
    const b0 = boundsFor(lens, a, w, h, false);
    const [x0, x1] = b0.x((b0.y0 + b0.y1) / 2);
    const rows = Math.max(1, Math.floor((b0.y1 - b0.y0) / (h + GAP_Y)) + 1);
    const fits = Math.max(1, Math.floor((x1 - x0 + w) / (w + GAP_X))) * rows;
    const b = perZone.get(zoneOf(a)) > fits ? boundsFor(lens, a, w, h, true) : b0;
    return { id: a.id, zone: zoneOf(a), x: p.x, y: p.y, b };
  });
  const clamp = (it) => {
    it.y = Math.min(it.b.y1, Math.max(it.b.y0, it.y));
    const [x0, x1] = it.b.x(it.y);
    it.x = Math.min(x1, Math.max(x0, it.x));
  };
  items.forEach(clamp);
  // Push overlapping pairs apart, mostly sideways (zones are wider than they are deep).
  const needX = w + GAP_X;
  const needY = h + GAP_Y * 0.6;
  // Push apart in depth. Level cards go whichever way there's more room, and when one card
  // is pinned at its zone's edge the other takes the rest of the push.
  const pushY = (a, c, oy, dy) => {
    let dir = Math.sign(dy);
    if (dir === 0) {
      const down = (a.y - a.b.y0) + (c.b.y1 - c.y);
      const up = (a.b.y1 - a.y) + (c.y - c.b.y0);
      dir = down >= up ? 1 : -1;
    }
    const push = (oy / 2 + 0.5) * dir;
    a.y -= push;
    c.y += push;
    clamp(a);
    clamp(c);
    const left = needY - Math.abs(c.y - a.y);
    if (left <= 0) return;
    const ay = a.y;
    a.y -= left * dir;
    clamp(a);
    if (Math.abs(a.y - ay) < 0.5) {
      c.y += left * dir;
      clamp(c);
    }
  };
  for (let round = 0; round < 400; round++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const c = items[j];
        const dx = c.x - a.x;
        const dy = c.y - a.y;
        const ox = needX - Math.abs(dx);
        const oy = needY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // Sideways unless the cards are nearly stacked and there's depth to spare.
        const room = Math.min(a.b.y1 - a.b.y0, c.b.y1 - c.b.y0);
        const sideways = ox < oy * 2.2 || room < needY;
        if (sideways) {
          const push = (ox / 2 + 0.5) * (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx));
          a.x -= push;
          c.x += push;
          clamp(a);
          clamp(c);
          // Hemmed in at the zone's sides: make room in depth instead.
          if (Math.abs(a.x - c.x) < needX - 0.5 && room >= needY) pushY(a, c, needY - Math.abs(c.y - a.y), c.y - a.y);
        } else pushY(a, c, oy, dy);
      }
    }
    if (!moved) break;
  }
  // Pushing can jam in a full zone. Seat any zone that still overlaps on an even grid of
  // slots, each card taking the free slot nearest to where it was.
  const overlaps = (a, c) => needX - Math.abs(c.x - a.x) > 0.5 && needY - Math.abs(c.y - a.y) > 0.5;
  const zones = new Map();
  for (const it of items) zones.set(it.zone, [...(zones.get(it.zone) ?? []), it]);
  for (const group of zones.values()) {
    if (!group.some((a, i) => group.slice(i + 1).some((c) => overlaps(a, c)))) continue;
    const { b } = group[0];
    const rows = Math.max(1, Math.floor((b.y1 - b.y0) / needY) + 1);
    const slots = [];
    for (let r = 0; r < rows; r++) {
      const y = rows === 1 ? (b.y0 + b.y1) / 2 : b.y0 + (r * (b.y1 - b.y0)) / (rows - 1);
      const [x0, x1] = b.x(y);
      const cols = Math.max(1, Math.floor((x1 - x0) / needX) + 1);
      for (let k = 0; k < cols; k++) slots.push({ x: cols === 1 ? (x0 + x1) / 2 : x0 + (k * (x1 - x0)) / (cols - 1), y });
    }
    if (slots.length < group.length) continue;
    const pairs = [];
    for (const it of group) for (const sl of slots) pairs.push({ it, sl, d: (it.x - sl.x) ** 2 + (it.y - sl.y) ** 2 });
    pairs.sort((p, q) => p.d - q.d);
    const seated = new Set();
    const taken = new Set();
    for (const { it, sl } of pairs) {
      if (seated.has(it) || taken.has(sl)) continue;
      seated.add(it);
      taken.add(sl);
      it.x = sl.x;
      it.y = sl.y;
    }
  }
  return Object.fromEntries(items.map((it) => [it.id, unproject(lens, it.x, it.y)]));
}

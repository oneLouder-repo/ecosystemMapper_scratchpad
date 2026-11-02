/**
 * How the lenses line up. Every lens divides the same depth scale (0 =
 * explicit, structural, the surface; 1 = implicit, personal, the deep end),
 * so a region of one lens corresponds to the regions of another that sit
 * at the same depths.
 *
 *   crosswalk(lenses, 'micro-meso-macro') →
 *     [{ region: micro, matches: { 'water-of-systems-change': [transformative], ... } }, ...]
 *
 * A region matches a tier when its middle depth falls inside the tier.
 */
export const midDepth = (r) => (r.depth[0] + r.depth[1]) / 2;

export function crosswalk(lenses, baseId = 'micro-meso-macro') {
  const list = [...lenses.values()];
  const base = list.find((l) => l.id === baseId);
  if (!base) return [];
  const byDepth = (a, b) => a.depth[0] - b.depth[0];
  return [...base.regions].sort(byDepth).map((tier) => ({
    region: tier,
    matches: Object.fromEntries(list.filter((l) => l.id !== baseId).map((l) => [
      l.id,
      [...l.regions].sort(byDepth).filter((r) => midDepth(r) >= tier.depth[0] && midDepth(r) < tier.depth[1] + (tier.depth[1] === 1 ? 1e-9 : 0)),
    ])),
  }));
}

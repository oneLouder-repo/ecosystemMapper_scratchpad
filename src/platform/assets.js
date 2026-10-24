/**
 * Assets: the things a task or workplan uses. An asset can point at
 * anything in any tool (an ecosystem actor, a staff member, a strategy
 * item) or stand on its own (a document, link, citation, media, a person
 * outside the org). Stored on the node as `assets: [Asset]`.
 *
 * Asset { id, kind, label, ref?, url?, detail?, year?, dataUrl? }
 *   `ref` is the id in the other tool's document; `label` is a fallback
 *   used if that item is later deleted.
 *
 * To add a kind (for a future tool): add it here, give it a resolver below
 * and a picker in ui/AssetChooser.js.
 */
export const ASSET_KINDS = [
  { id: 'actor', label: 'Ecosystem actor', icon: 'mapper' },
  { id: 'staff', label: 'Staff', icon: 'org' },
  { id: 'person', label: 'Person', icon: 'person' },
  { id: 'plan', label: 'Strategy item', icon: 'strategy' },
  { id: 'document', label: 'Document', icon: 'doc' },
  { id: 'link', label: 'Link', icon: 'link' },
  { id: 'literature', label: 'Literature', icon: 'book' },
  { id: 'media', label: 'Media', icon: 'media' },
];
export const kindById = Object.fromEntries(ASSET_KINDS.map((k) => [k.id, k]));

/**
 * Resolve an asset against the current documents ({ map, org, strategy }),
 * so renamed items show their new names. Returns { label, sub, href, missing }.
 */
export function resolveAsset(asset, docs) {
  switch (asset.kind) {
    case 'actor': {
      const a = docs.map?.actors[asset.ref];
      return a
        ? { label: a.label, sub: `${a.kind === 'agent' ? 'Agent' : 'Actor'} on the ecosystem map`, href: 'mapper.html' }
        : { label: asset.label, sub: 'No longer on the map', missing: true };
    }
    case 'staff': {
      const s = docs.org?.staff[asset.ref];
      return s ? { label: s.name, sub: s.title, href: 'org.html' } : { label: asset.label, sub: 'No longer on staff', missing: true };
    }
    case 'plan': {
      const n = docs.strategy?.nodes[asset.ref];
      return n ? { label: n.title, sub: `Strategy · ${n.type}`, href: `strategy.html#${n.id}` } : { label: asset.label, sub: 'Removed from the strategy', missing: true };
    }
    case 'document':
      return { label: asset.label, sub: asset.detail ?? 'Document', href: asset.dataUrl ?? asset.url };
    case 'literature':
      return { label: asset.label, sub: ['Literature', asset.year].filter(Boolean).join(' · '), href: asset.url };
    default:
      return { label: asset.label, sub: asset.detail ?? kindById[asset.kind]?.label ?? asset.kind, href: asset.url };
  }
}

/** A workplan's own assets plus every asset its tasks use, each tagged with where it came from. */
export function assetsInWorkplan(strategy, workplanId) {
  const wp = strategy.nodes[workplanId];
  const out = (wp.assets ?? []).map((a) => ({ asset: a, from: wp }));
  for (const t of Object.values(strategy.nodes)) {
    if (t.parentId === workplanId && t.type === 'task') for (const a of t.assets ?? []) out.push({ asset: a, from: t });
  }
  return out;
}

/** Same item used more than once (e.g. one actor across several tasks) counts once. */
export const assetKey = (a) => (a.ref ? `${a.kind}:${a.ref}` : `${a.kind}:${a.url ?? a.label}`);

/** Every asset used at or below a node (a plan, objective, goal or workplan), each tagged with where it came from. */
export function assetsUnder(strategy, id) {
  const out = [];
  const visit = (n) => {
    for (const a of n.assets ?? []) out.push({ asset: a, from: n });
    for (const c of Object.values(strategy.nodes)) if (c.parentId === n.id) visit(c);
  };
  if (strategy.nodes[id]) visit(strategy.nodes[id]);
  return out;
}

/** Group used assets by item, so one actor used in three tasks shows once with three sources. */
export function groupAssets(used) {
  const byKey = new Map();
  for (const u of used) {
    const key = assetKey(u.asset);
    if (!byKey.has(key)) byKey.set(key, { asset: u.asset, from: [] });
    byKey.get(key).from.push(u.from);
  }
  return [...byKey.values()];
}

/**
 * Assets: the things a task or workplan uses. An asset can point at
 * anything in any tool (an ecosystem actor, a staff member, a strategy
 * item) or stand on its own (a document, link, citation, media, a person
 * outside the org). Stored on the node as `assets: [Asset]`.
 *
 * Asset { id, kind, label, ref?, mapId?, libraryId?, url?, detail?, year?, dataUrl? }
 *   `ref` is the id in the other plugin's document (for an actor, `mapId`
 *   says which map); `libraryId` is an item in the document library (for a
 *   document or literature); `label` is a fallback used if that item is later deleted.
 *
 * To add a kind (for a future tool): add it here, give it a resolver below
 * and a picker in ui/AssetChooser.js.
 */
export const ASSET_KINDS = [
  { id: 'map', label: 'Ecosystem map', icon: 'mapper' },
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

/** Find an actor: in its own map, or (for assets saved before maps had ids) in any map. */
function findActor(asset, mapContents = {}) {
  const own = mapContents[asset.mapId]?.actors[asset.ref];
  if (own) return { actor: own, mapId: asset.mapId };
  for (const [mapId, map] of Object.entries(mapContents)) if (map.actors[asset.ref]) return { actor: map.actors[asset.ref], mapId };
  return null;
}

/**
 * Resolve an asset against the current documents ({ mapContents, maps, org, strategy }),
 * so renamed items show their new names. Returns { label, sub, href, missing }.
 */
export function resolveAsset(asset, docs) {
  switch (asset.kind) {
    case 'actor': {
      const found = findActor(asset, docs.mapContents);
      if (!found) return { label: asset.label, sub: 'No longer on the map', missing: true };
      const { actor: a, mapId } = found;
      const mapTitle = docs.maps?.maps[mapId]?.title ?? 'the ecosystem map';
      return { label: a.label, sub: `${a.kind === 'agent' ? 'Agent' : 'Actor'} on ${mapTitle}`, href: `mapper.html#${mapId}` };
    }
    case 'map': {
      if (asset.libraryId) {
        const it = docs.library?.items?.[asset.libraryId];
        return it ? { label: it.meta.title || asset.label, sub: 'Ecosystem map file in the library', href: `library.html#item/${asset.libraryId}` } : { label: asset.label, sub: 'Removed from the library', missing: true };
      }
      const entry = docs.maps?.maps?.[asset.ref];
      if (!entry) return { label: asset.label, sub: 'Map removed', missing: true };
      const actors = Object.keys(docs.mapContents?.[asset.ref]?.actors ?? {}).length;
      return { label: entry.title, sub: `Ecosystem map · ${actors} actor${actors === 1 ? '' : 's'}`, href: `mapper.html#${asset.ref}` };
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
    case 'literature': {
      if (asset.libraryId) {
        const it = docs.library?.items?.[asset.libraryId];
        if (!it) return { label: asset.label, sub: 'Removed from the library', missing: true };
        const year = String(it.meta.issued ?? '').slice(0, 4);
        const who = (it.meta.creators ?? [])[0];
        const by = who ? (who.literal ?? who.family) + ((it.meta.creators.length > 1) ? ' et al.' : '') : '';
        return { label: it.meta.title || asset.label, sub: ['In the library', by, year].filter(Boolean).join(' · '), href: `library.html#item/${asset.libraryId}` };
      }
      if (asset.kind === 'document') return { label: asset.label, sub: asset.detail ?? 'Document', href: asset.dataUrl ?? asset.url };
      return { label: asset.label, sub: ['Literature', asset.year].filter(Boolean).join(' · '), href: asset.url };
    }
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
export const assetKey = (a) => (a.ref ? `${a.kind}:${a.mapId ? `${a.mapId}/` : ''}${a.ref}` : a.libraryId ? `${a.kind}:lib/${a.libraryId}` : `${a.kind}:${a.url ?? a.label}`);

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

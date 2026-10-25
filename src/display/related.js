/**
 * What a map item is tied to: an actor's connectors, the actors at their
 * other ends and the groups it's in; or a connector's two end actors.
 * Used to light things up (data viz) and to bring them to the front.
 */
export function relatedTo(map, id) {
  const ids = new Set([id]);
  if (map.actors[id]) {
    for (const c of Object.values(map.connectors)) {
      if (c.from?.actorId === id || c.to?.actorId === id) {
        ids.add(c.id);
        if (c.from?.actorId) ids.add(c.from.actorId);
        if (c.to?.actorId) ids.add(c.to.actorId);
      }
    }
    for (const g of Object.values(map.groups ?? {})) if (g.memberIds.includes(id)) ids.add(g.id);
  } else if (map.connectors[id]) {
    const c = map.connectors[id];
    for (const end of [c.from, c.to]) if (end?.actorId) ids.add(end.actorId);
  }
  return ids;
}

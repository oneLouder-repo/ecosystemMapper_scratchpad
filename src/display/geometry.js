/** Centre of a dock: the actor's centre, or the floating point itself. */
export function dockCenter(map, dock) {
  if (!dock) return null;
  if (dock.actorId) {
    const a = map.actors[dock.actorId];
    return a ? { x: a.x, y: a.y } : null;
  }
  return { x: dock.x, y: dock.y };
}

/** Where a connector meets a dock: the actor's edge facing `toward`, or the floating point. */
export function dockPoint(map, dock, toward) {
  const c = dockCenter(map, dock);
  if (!c || !dock.actorId || !toward) return c;
  const a = map.actors[dock.actorId];
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const pad = 6;
  const t = Math.min((a.w / 2 + pad) / Math.abs(dx || 1e-9), (a.h / 2 + pad) / Math.abs(dy || 1e-9));
  return t >= 1 ? c : { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Drawing one connector by dragging, shared by the Connect tool and by an
 * actor's dock box (which works with the Select tool). Start on an actor
 * (or anywhere), drop on another actor to dock there, or on the board to
 * leave a floating end. The actor under the pointer lights up as a target.
 */
export function startConnect(e, ctx) {
  const from = e.view?.kind === 'actor' ? { actorId: e.view.id } : { x: e.worldX, y: e.worldY };
  const op = ctx.ops.addConnector({
    from,
    to: { x: e.worldX, y: e.worldY },
    type: ctx.mapView.lens.defaultConnectorType,
    layerId: ctx.ui.activeLayerId,
  });
  ctx.store.apply(op, { history: false });
  ctx.mapView.viewFor(op.id)?.node.classList.add('ghost');
  ctx.stage.svgEl.classList.add('connecting');
  return { op, x: e.worldX, y: e.worldY, target: null };
}

const targetOf = (e, pending) => (e.view?.kind === 'actor' && e.view.id !== pending.op.data.from.actorId ? e.view : null);

export function moveConnect(pending, e, ctx) {
  ctx.store.apply(ctx.ops.dockConnector(pending.op.id, 'to', { x: e.worldX, y: e.worldY }), { history: false });
  const target = targetOf(e, pending);
  if (target !== pending.target) {
    pending.target?.node.classList.remove('target');
    target?.node.classList.add('target');
    pending.target = target;
  }
}

/** Finish: returns the new connector's id, or null if it was too short to keep. */
export function endConnect(pending, e, ctx) {
  const { op } = pending;
  const { store, ops } = ctx;
  cancelConnect(pending, ctx);
  const target = targetOf(e, pending);
  const to = target ? { actorId: target.id } : { x: e.worldX, y: e.worldY };
  if (!target && Math.hypot(e.worldX - pending.x, e.worldY - pending.y) < 12) return null;
  store.apply({ ...op, data: { ...op.data, to } });
  ctx.mapView.select([op.id]);
  return op.id;
}

export function cancelConnect(pending, ctx) {
  pending.target?.node.classList.remove('target');
  ctx.stage.svgEl.classList.remove('connecting');
  if (ctx.store.map.connectors[pending.op.id]) ctx.store.apply(ctx.ops.removeConnector(pending.op.id), { history: false });
}

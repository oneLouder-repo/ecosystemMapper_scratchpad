/**
 * Drag from an actor (or anywhere) to another actor (or anywhere) to draw
 * a connector. Ends dropped on an actor dock to it; ends dropped on the
 * board float and can be docked later with the select tool. The tool
 * stays on so several connectors can be drawn in a row.
 */
let pending = null;

export default {
  id: 'connect',
  label: 'Connect',
  icon: 'connect',
  key: 'c',
  cursor: 'connect',

  onPointerDown(e, ctx) {
    const from = e.view?.kind === 'actor' ? { actorId: e.view.id } : { x: e.worldX, y: e.worldY };
    const op = ctx.ops.addConnector({
      from,
      to: { x: e.worldX, y: e.worldY },
      type: ctx.mapView.lens.defaultConnectorType,
      layerId: ctx.ui.activeLayerId,
    });
    ctx.store.apply(op, { history: false });
    ctx.mapView.viewFor(op.id)?.node.classList.add('ghost');
    pending = { op, x: e.worldX, y: e.worldY };
  },

  onPointerMove(e, ctx) {
    if (!pending) return;
    ctx.store.apply(ctx.ops.dockConnector(pending.op.id, 'to', { x: e.worldX, y: e.worldY }), { history: false });
  },

  onPointerUp(e, ctx) {
    if (!pending) return;
    const { op } = pending;
    const { store, ops } = ctx;
    store.apply(ops.removeConnector(op.id), { history: false });

    const onActor = e.view?.kind === 'actor' && e.view.id !== op.data.from.actorId;
    const to = onActor ? { actorId: e.view.id } : { x: e.worldX, y: e.worldY };
    const tooShort = !onActor && Math.hypot(e.worldX - pending.x, e.worldY - pending.y) < 12;
    pending = null;
    if (tooShort) return;

    store.apply({ ...op, data: { ...op.data, to } });
    ctx.mapView.select([op.id]);
  },

  deactivate(ctx) {
    if (pending) ctx.store.apply(ctx.ops.removeConnector(pending.op.id), { history: false });
    pending = null;
  },
};

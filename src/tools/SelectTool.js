/**
 * Select, move, re-dock and pan.
 *   click an actor or connector   select it (shift adds to the selection)
 *   drag an actor                 move it
 *   drag a connector end handle   re-dock it onto an actor, or leave it floating
 *   drag empty board              pan
 *   double-click an actor         edit its label
 *   double-click empty board      add an actor there
 *   Delete / Backspace            remove the selection
 */
let drag = null;

export default {
  id: 'select',
  label: 'Select',
  icon: '↖',
  key: 'v',

  onPointerDown(e, ctx) {
    const { view } = e;
    const { map } = ctx.store;

    if (view?.kind === 'connector' && e.handle && view.selected) {
      drag = { kind: 'dock', id: view.id, end: e.handle, original: structuredClone(map.connectors[view.id][e.handle]) };
      view.node.classList.add('ghost');
      return;
    }
    if (view) {
      if (!view.selected || e.shiftKey) ctx.mapView.select([view.id], { add: e.shiftKey });
      if (view.kind === 'actor') {
        const a = map.actors[view.id];
        drag = { kind: 'move', id: view.id, dx: e.worldX - a.x, dy: e.worldY - a.y, x0: a.x, y0: a.y, moved: false };
      }
      return;
    }
    if (!e.shiftKey) ctx.mapView.select([]);
    drag = { kind: 'pan', x: e.screenX, y: e.screenY };
  },

  onPointerMove(e, ctx) {
    if (!drag) return;
    const { store, ops } = ctx;
    if (drag.kind === 'move') {
      drag.moved = true;
      store.apply(ops.moveActor(drag.id, e.worldX - drag.dx, e.worldY - drag.dy), { history: false });
    } else if (drag.kind === 'dock') {
      store.apply(ops.dockConnector(drag.id, drag.end, { x: e.worldX, y: e.worldY }), { history: false });
    } else if (drag.kind === 'pan') {
      ctx.stage.panBy(e.screenX - drag.x, e.screenY - drag.y);
      drag.x = e.screenX;
      drag.y = e.screenY;
    }
  },

  onPointerUp(e, ctx) {
    if (!drag) return;
    const { store, ops } = ctx;
    if (drag.kind === 'move' && drag.moved) {
      store.apply(ops.moveActor(drag.id, e.worldX - drag.dx, e.worldY - drag.dy), {
        inverse: ops.moveActor(drag.id, drag.x0, drag.y0),
      });
    } else if (drag.kind === 'dock') {
      const conn = store.map.connectors[drag.id];
      const otherEnd = conn[drag.end === 'from' ? 'to' : 'from'];
      const onActor = e.view?.kind === 'actor' && e.view.id !== otherEnd.actorId;
      const dock = onActor ? { actorId: e.view.id } : { x: e.worldX, y: e.worldY };
      ctx.mapView.viewFor(drag.id)?.node.classList.remove('ghost');
      store.apply(ops.dockConnector(drag.id, drag.end, dock), {
        inverse: ops.dockConnector(drag.id, drag.end, drag.original),
      });
    }
    drag = null;
  },

  onDoubleClick(e, ctx) {
    if (e.view?.kind === 'actor') ctx.ui.editLabel(e.view.id);
    else if (!e.view) ctx.actions.addActorAt(e.worldX, e.worldY);
  },

  onKeyDown(e, ctx) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      ctx.actions.deleteSelection();
      return true;
    }
    return false;
  },

  deactivate() {
    drag = null;
  },
};

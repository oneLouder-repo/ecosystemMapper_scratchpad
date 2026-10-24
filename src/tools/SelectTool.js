import { Sprite } from '../core/Sprite.js';
import { regionAt } from '../lenses/index.js';

/**
 * Select, move and re-dock.
 *   click an actor or connector   select it (shift toggles it in the selection)
 *   drag empty board              draw a marquee to select everything it touches
 *   drag a selected actor         move every selected actor together
 *   drag a connector end handle   re-dock it onto an actor, or leave it floating
 *   double-click an actor         edit its label
 *   double-click empty board      add an actor there
 *   Delete / Backspace            remove the selection
 * Panning lives in the pan tool, middle-drag, scroll, or holding Space.
 */
let drag = null;

export default {
  id: 'select',
  label: 'Select',
  icon: 'select',
  key: 'v',

  onPointerDown(e, ctx) {
    const { view } = e;
    const { map } = ctx.store;
    const { mapView } = ctx;

    if (view?.kind === 'connector' && e.handle && view.selected) {
      drag = { kind: 'dock', id: view.id, end: e.handle, original: structuredClone(map.connectors[view.id][e.handle]) };
      view.node.classList.add('ghost');
      return;
    }

    if (view) {
      if (e.shiftKey) {
        if (view.selected) mapView.deselect([view.id]);
        else mapView.select([view.id], { add: true });
      } else if (!view.selected) {
        mapView.select([view.id]);
      }
      if (view.kind === 'actor' && view.selected) {
        const actors = mapView.selectedItems().actorIds.map((id) => map.actors[id]);
        drag = {
          kind: 'move',
          lead: view.id,
          x: e.worldX,
          y: e.worldY,
          start: actors.map((a) => ({ id: a.id, x: a.x, y: a.y })),
          moved: false,
        };
      }
      return;
    }

    const marquee = new Sprite();
    marquee.node.classList.add('marquee');
    marquee.rect = marquee.draw('rect');
    ctx.stage.overlayLayer.addChild(marquee);
    drag = { kind: 'marquee', x: e.worldX, y: e.worldY, marquee, base: e.shiftKey ? [...mapView.selection] : [] };
    if (!e.shiftKey) mapView.select([]);
  },

  onPointerMove(e, ctx) {
    if (!drag) return;
    const { store, ops, mapView } = ctx;

    if (drag.kind === 'move') {
      drag.moved = true;
      const dx = e.worldX - drag.x;
      const dy = e.worldY - drag.y;
      store.apply(ops.batch(drag.start.map((a) => ops.moveActor(a.id, a.x + dx, a.y + dy))), { history: false });
      const lead = store.map.actors[drag.lead];
      mapView.lensView.highlight(regionAt(mapView.lens, lead.x, lead.y)?.id);
    } else if (drag.kind === 'dock') {
      store.apply(ops.dockConnector(drag.id, drag.end, { x: e.worldX, y: e.worldY }), { history: false });
    } else if (drag.kind === 'marquee') {
      const box = rectFrom(drag.x, drag.y, e.worldX, e.worldY);
      for (const [k, v] of Object.entries({ x: box.x, y: box.y, width: box.w, height: box.h })) {
        drag.marquee.rect.setAttribute(k, v);
      }
      mapView.select([...drag.base, ...itemsIn(store.map, box)]);
    }
  },

  onPointerUp(e, ctx) {
    if (!drag) return;
    const { store, ops, mapView } = ctx;

    if (drag.kind === 'move' && drag.moved) {
      const dx = e.worldX - drag.x;
      const dy = e.worldY - drag.y;
      store.apply(ops.batch(drag.start.map((a) => ops.moveActor(a.id, a.x + dx, a.y + dy))), {
        inverse: ops.batch(drag.start.map((a) => ops.moveActor(a.id, a.x, a.y))),
      });
      mapView.lensView.highlight(null);
    } else if (drag.kind === 'move' && !e.shiftKey && mapView.selection.size > 1) {
      // A click (no drag) on one of several selected actors narrows the selection to it.
      mapView.select([drag.lead]);
    } else if (drag.kind === 'dock') {
      const conn = store.map.connectors[drag.id];
      const otherEnd = conn[drag.end === 'from' ? 'to' : 'from'];
      const onActor = e.view?.kind === 'actor' && e.view.id !== otherEnd.actorId;
      const dock = onActor ? { actorId: e.view.id } : { x: e.worldX, y: e.worldY };
      mapView.viewFor(drag.id)?.node.classList.remove('ghost');
      store.apply(ops.dockConnector(drag.id, drag.end, dock), {
        inverse: ops.dockConnector(drag.id, drag.end, drag.original),
      });
    } else if (drag.kind === 'marquee') {
      drag.marquee.parent?.removeChild(drag.marquee);
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

  deactivate(ctx) {
    if (drag?.kind === 'marquee') drag.marquee.parent?.removeChild(drag.marquee);
    ctx.mapView.lensView.highlight(null);
    drag = null;
  },
};

function rectFrom(x0, y0, x1, y1) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/** Actors the box touches, plus connectors with both ends inside it. Skips hidden and locked layers. */
function itemsIn(map, box) {
  const layers = new Map(map.layers.map((l) => [l.id, l]));
  const pickable = (item) => {
    const layer = layers.get(item.layerId) ?? map.layers[0];
    return layer?.visible !== false && !layer?.locked;
  };
  const inside = (p) => p && p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
  const touches = (a) =>
    a.x + a.w / 2 >= box.x && a.x - a.w / 2 <= box.x + box.w && a.y + a.h / 2 >= box.y && a.y - a.h / 2 <= box.y + box.h;
  const actors = Object.values(map.actors).filter((a) => pickable(a) && touches(a));
  const picked = new Set(actors.map((a) => a.id));
  const endIn = (dock) => (dock.actorId ? picked.has(dock.actorId) : inside(dock));
  const connectors = Object.values(map.connectors).filter((c) => pickable(c) && endIn(c.from) && endIn(c.to));
  return [...picked, ...connectors.map((c) => c.id)];
}

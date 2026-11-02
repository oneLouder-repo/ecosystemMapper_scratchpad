import { relatedTo } from '../display/related.js';

/**
 * Data viz: click an actor, agent or connector and everything it is
 * connected to pulses while the rest of the map dims, for 15 seconds, or
 * until you click the board or switch the tool off. Drag the board to pan.
 */
const FOCUS_MS = 15000;
let timer = null;
let pan = null;

function clear(ctx) {
  clearTimeout(timer);
  timer = null;
  ctx.mapView.focus(null);
}

function focusOn(ctx, id) {
  clear(ctx);
  const ids = [...relatedTo(ctx.store.map, id)];
  ctx.mapView.focus(ids);
  ctx.mapView.raise(ids);
  timer = setTimeout(() => clear(ctx), FOCUS_MS);
}

export default {
  id: 'dataviz',
  label: 'Data viz',
  icon: 'dataviz',
  key: 'd',
  cursor: 'pointer',
  hint: 'click an actor or connector to see its connections',

  deactivate(ctx) {
    clear(ctx);
    pan = null;
  },
  onPointerDown(e, ctx) {
    if (e.view?.kind === 'actor' || e.view?.kind === 'connector') focusOn(ctx, e.view.id);
    else pan = { x: e.screenX, y: e.screenY, moved: false };
  },
  onPointerMove(e, ctx) {
    if (!pan) return;
    if (Math.hypot(e.screenX - pan.x, e.screenY - pan.y) > 3) pan.moved = true;
    ctx.stage.panBy(e.screenX - pan.x, e.screenY - pan.y);
    pan.x = e.screenX;
    pan.y = e.screenY;
  },
  onPointerUp(e, ctx) {
    if (pan && !pan.moved) clear(ctx);
    pan = null;
  },
};

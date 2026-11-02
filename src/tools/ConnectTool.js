import { startConnect, moveConnect, endConnect, cancelConnect } from './connectDrag.js';

/**
 * Draw one connector: drag from an actor to another actor. Then it's back
 * to Select. (Dragging from an actor's dock box does the same, any time.)
 */
let pending = null;

export default {
  id: 'connect',
  label: 'Connect',
  icon: 'connect',
  key: 'c',
  cursor: 'connect',
  oneShot: true,

  onPointerDown(e, ctx) {
    pending = startConnect(e, ctx);
  },
  onPointerMove(e, ctx) {
    if (pending) moveConnect(pending, e, ctx);
  },
  onPointerUp(e, ctx) {
    if (!pending) return;
    endConnect(pending, e, ctx);
    pending = null;
    ctx.tools.use('select');
  },
  deactivate(ctx) {
    if (pending) cancelConnect(pending, ctx);
    pending = null;
  },
};

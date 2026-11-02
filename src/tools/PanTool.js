/** Drag to move around the board. (The select tool also pans on empty space.) */
let last = null;

export default {
  id: 'pan',
  label: 'Pan',
  icon: 'pan',
  key: 'h',
  cursor: 'grab',

  onPointerDown(e) {
    last = { x: e.screenX, y: e.screenY };
  },
  onPointerMove(e, ctx) {
    if (!last) return;
    ctx.stage.panBy(e.screenX - last.x, e.screenY - last.y);
    last = { x: e.screenX, y: e.screenY };
  },
  onPointerUp() {
    last = null;
  },
};

/** Click the board to drop a new actor, then type its name. */
export default {
  id: 'actor',
  label: 'Actor',
  icon: '▢',
  key: 'a',
  cursor: 'copy',

  onPointerDown(e, ctx) {
    ctx.actions.addActorAt(e.worldX, e.worldY);
    ctx.tools.use('select');
  },
};

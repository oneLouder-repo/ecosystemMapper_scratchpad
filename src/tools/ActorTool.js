/**
 * Click empty board to drop a new actor and type its name. The tool stays
 * on, so keep clicking to add more. Click an existing actor to select it.
 * Press A or click the tool again (or Esc) to go back to Select.
 */
export default {
  id: 'actor',
  label: 'Actor',
  icon: 'actor',
  key: 'a',
  cursor: 'addActor',

  onPointerDown(e, ctx) {
    if (e.view) {
      ctx.mapView.select([e.view.id]);
      return;
    }
    ctx.actions.addActorAt(e.worldX, e.worldY);
  },
};

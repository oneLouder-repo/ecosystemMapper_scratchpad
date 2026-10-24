/** Inline text box over an actor for editing its label in place. */
export function LabelEditor(ctx) {
  const input = document.createElement('input');
  input.className = 'label-editor';
  input.hidden = true;
  document.body.append(input);
  let editing = null;

  const close = (commit) => {
    if (!editing) return;
    const { id, view } = editing;
    editing = null;
    input.hidden = true;
    view?.text.style.removeProperty('visibility');
    const actor = ctx.store.map.actors[id];
    if (commit && actor && input.value !== actor.label) {
      ctx.store.apply(ctx.ops.updateActor(id, { label: input.value.trim() }));
    }
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') close(true);
    if (e.key === 'Escape') close(false);
  });
  input.addEventListener('blur', () => close(true));
  ctx.stage.addEventListener('camera', () => close(true));

  return function editLabel(id) {
    close(true);
    const actor = ctx.mapView.world.actors[id];
    const view = ctx.mapView.viewFor(id);
    if (!actor || !view) return;
    const { scale } = ctx.stage;
    const p = ctx.stage.toScreen(actor.x - actor.w / 2, actor.y - actor.h / 2);
    Object.assign(input.style, {
      left: `${p.x}px`,
      top: `${p.y}px`,
      width: `${actor.w * scale}px`,
      height: `${actor.h * scale}px`,
      fontSize: `${15 * scale}px`,
    });
    input.value = actor.label;
    input.hidden = false;
    view.text.style.visibility = 'hidden';
    editing = { id, view };
    // Focus after the current pointer event, or the browser's own focus handling steals it back.
    setTimeout(() => {
      if (editing?.id !== id) return;
      input.focus();
      input.select();
    });
  };
}

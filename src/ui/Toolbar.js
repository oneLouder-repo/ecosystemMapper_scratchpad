import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * The mapper's tools, as a menu in the sidebar. Nothing here stays
 * switched on except Data viz:
 *   Select          the usual pointer
 *   Actor, Agent    click to add one, or drag one onto the board
 *   Connect         draw one connector, then back to Select
 *   Data viz        on until you switch it off
 */
export function Toolbar(el, ctx) {
  const { tools } = ctx;
  el.classList.add('menu', 'side-menu', 'tool-menu');
  const label = (text, key) => h('span', { class: 'side-text' }, text, key && h('small', {}, key));
  const toolButton = (tool) => {
    const on = tool === tools.active;
    return h('li', {}, h('button', {
      type: 'button',
      class: `tool${on && !tool.oneShot ? ' active menu-active' : ''}${on && tool.oneShot ? ' armed menu-active' : ''}`,
      title: `${tool.label}${tool.key ? ` (${tool.key.toUpperCase()})` : ''}${tool.hint ? `: ${tool.hint}` : ''}`,
      'aria-pressed': tool.oneShot ? null : String(on),
      onclick: () => tools.toggle(tool.id),
    }, icon(tool.icon, 18), label(tool.label, tool.key?.toUpperCase())));
  };

  const render = () => {
    const t = (id) => tools.tools.get(id);
    el.replaceChildren(
      toolButton(t('select')),
      AddButton(ctx, 'actor', 'Actor', 'A', label),
      AddButton(ctx, 'agent', 'Agent', 'Shift+A', label),
      toolButton(t('connect')),
      toolButton(t('dataviz')),
    );
  };
  tools.addEventListener('change', render);
  render();
}

/** Click to add an actor (or agent) in view; drag to drop one exactly where you want it. */
function AddButton(ctx, kind, text, key, label) {
  let drag = null;
  let suppressClick = false;
  const board = ctx.stage.svgEl;
  const overBoard = (x, y) => board.contains(document.elementFromPoint(x, y));

  const button = h('button', {
    type: 'button',
    class: 'tool tool-add',
    title: `Add ${kind === 'agent' ? 'an agent' : 'an actor'} (${key}). Or drag it onto the board.`,
    onclick: () => {
      if (suppressClick) { suppressClick = false; return; }
      ctx.actions.addActorInView(kind);
    },
    onpointerdown: (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, ghost: null };
      button.setPointerCapture(e.pointerId);
    },
    onpointermove: (e) => {
      if (!drag) return;
      if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
        drag.ghost = h('div', { class: `drag-actor${kind === 'agent' ? ' agent' : ''}`, 'aria-hidden': 'true' }, `New ${kind}`);
        document.body.append(drag.ghost);
      }
      if (!drag.ghost) return;
      drag.ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      const over = overBoard(e.clientX, e.clientY);
      drag.ghost.classList.toggle('over', over);
      ctx.mapView.lensView.highlight(over ? ctx.actions.regionAtScreen(e.clientX, e.clientY) : null);
    },
    onpointerup: (e) => {
      if (!drag) return;
      const { ghost } = drag;
      drag = null;
      if (!ghost) return;
      ghost.remove();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; });
      ctx.mapView.lensView.highlight(null);
      if (overBoard(e.clientX, e.clientY)) {
        const w = ctx.stage.toWorld(e.clientX, e.clientY);
        ctx.actions.addActorAt(w.x, w.y, kind);
      }
    },
  }, icon(kind, 18), label(text, key));
  return h('li', {}, button);
}

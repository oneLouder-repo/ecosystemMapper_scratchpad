import { h } from '../ui/dom.js';
import { statusById } from '../platform/strategy.js';

/**
 * Data viz: click an actor, agent or connector and everything it is
 * connected to pulses while the rest of the map dims, for 15 seconds (or
 * until the tool is switched off). An info box says who in that picture
 * is part of planned work in Strategy & Work (tasks and workplans that
 * list the actor as an asset). Drag the board to pan.
 */
const FOCUS_MS = 15000;
let box = null;
let timer = null;
let countdown = null;
let pan = null;

/** Tasks and workplans that list an actor as an asset, by actor id. */
export function workByActor(strategy) {
  const out = {};
  for (const n of Object.values(strategy?.nodes ?? {})) {
    for (const asset of n.assets ?? []) {
      if (asset.kind !== 'actor' || !asset.ref) continue;
      (out[asset.ref] ??= []).push(n);
    }
  }
  return out;
}

/** What lights up for a clicked item: an actor and its connections, or a connector and its two ends. */
export function relatedTo(map, id) {
  const ids = new Set([id]);
  if (map.actors[id]) {
    for (const c of Object.values(map.connectors)) {
      if (c.from?.actorId === id || c.to?.actorId === id) {
        ids.add(c.id);
        if (c.from?.actorId) ids.add(c.from.actorId);
        if (c.to?.actorId) ids.add(c.to.actorId);
      }
    }
    for (const g of Object.values(map.groups ?? {})) if (g.memberIds.includes(id)) ids.add(g.id);
  } else if (map.connectors[id]) {
    const c = map.connectors[id];
    for (const end of [c.from, c.to]) if (end?.actorId) ids.add(end.actorId);
  }
  return ids;
}

function clear(ctx) {
  clearTimeout(timer);
  clearInterval(countdown);
  timer = countdown = null;
  ctx.mapView.focus(null);
  if (box) render(ctx, null);
}

function focusOn(ctx, id) {
  clear(ctx);
  const ids = relatedTo(ctx.store.map, id);
  ctx.mapView.focus([...ids]);
  const ends = Date.now() + FOCUS_MS;
  render(ctx, { id, ids, ends });
  timer = setTimeout(() => clear(ctx), FOCUS_MS);
  countdown = setInterval(() => {
    const left = box?.querySelector('.dv-left');
    if (left) left.textContent = `${Math.max(0, Math.ceil((ends - Date.now()) / 1000))}s`;
  }, 250);
}

function render(ctx, focus) {
  const { map } = ctx.store;
  const work = workByActor(ctx.strategy());
  const name = (id) => map.actors[id]?.label || 'Untitled';
  const actorsIn = focus ? [...focus.ids].filter((x) => map.actors[x]) : [];
  const WorkList = (actorId) => {
    const items = work[actorId] ?? [];
    return items.length
      ? h('ul', { class: 'dv-work' }, items.map((n) => h('li', {},
          h('a', { href: `strategy.html#${n.id}`, target: '_blank', rel: 'noopener' }, n.title),
          h('small', {}, n.type === 'task' ? ` · task, ${statusById[n.status]?.label.toLowerCase() ?? n.status}` : ` · ${n.type}`))))
      : h('p', { class: 'dv-none' }, 'Not part of planned work yet');
  };

  let body;
  if (!focus) {
    const engaged = Object.values(map.actors).filter((a) => work[a.id]?.length);
    body = [
      h('p', {}, 'Click an actor, agent or connector to light up its connections for 15 seconds. Everything else dims.'),
      h('p', { class: 'dv-summary' }, h('strong', {}, `${engaged.length} of ${Object.keys(map.actors).length}`), ' actors on this map are part of planned work in Strategy & Work.'),
      engaged.length > 0 && h('ul', { class: 'dv-names' }, engaged.slice(0, 8).map((a) => h('li', {}, a.label || 'Untitled', h('small', {}, ` · ${work[a.id].length}`)))),
    ];
  } else {
    const c = map.connectors[focus.id];
    const title = c ? `${name(c.from?.actorId)} → ${name(c.to?.actorId)}` : name(focus.id);
    const connections = [...focus.ids].filter((x) => map.connectors[x]).length;
    const engaged = actorsIn.filter((x) => work[x]?.length);
    body = [
      h('p', { class: 'dv-focus-title' }, h('strong', {}, title), h('span', { class: 'dv-left' }, '15s')),
      h('p', { class: 'muted small' }, c
        ? `${ctx.mapView.lens.typeById[c.type]?.label ?? c.type}${c.label ? `: ${c.label}` : ''} · strength ${c.strength ?? 3} of 5`
        : `${connections} connection${connections === 1 ? '' : 's'} · ${actorsIn.length - 1} connected actor${actorsIn.length === 2 ? '' : 's'}`),
      h('p', { class: 'dv-summary' }, engaged.length
        ? [h('strong', {}, `${engaged.length} of ${actorsIn.length}`), ' in this picture are part of planned work:']
        : 'No one in this picture is part of planned work yet. Add them as assets on tasks in Strategy & Work.'),
      h('ul', { class: 'dv-actors' }, actorsIn.sort((a, b) => (work[b]?.length ?? 0) - (work[a]?.length ?? 0)).map((x) => h('li', { class: work[x]?.length ? 'engaged' : '' },
        h('strong', {}, name(x)), WorkList(x)))),
      h('button', { class: 'btn btn-xs', onclick: () => clear(ctx) }, 'Clear'),
    ];
  }
  box.replaceChildren(
    h('header', {}, h('strong', {}, 'Data viz'), h('button', { class: 'btn btn-ghost btn-xs', 'aria-label': 'Switch data viz off', onclick: () => ctx.tools.use('select') }, '✕')),
    h('div', { class: 'dv-body' }, body));
}

export default {
  id: 'dataviz',
  label: 'Data viz',
  icon: 'dataviz',
  key: 'd',
  cursor: 'pointer',
  hint: 'click an actor or connector to see its connections',

  activate(ctx) {
    box = h('aside', { class: 'dataviz-box', 'aria-live': 'polite' });
    ctx.stage.svgEl.parentNode.append(box);
    render(ctx, null);
  },
  deactivate(ctx) {
    clear(ctx);
    box?.remove();
    box = null;
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

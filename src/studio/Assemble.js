import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { svg } from '../core/svg.js';
import { col } from '../core/collections.js';
import { kindById } from '../platform/assets.js';
import { strategyOps, taskSummary } from '../platform/strategy.js';
import { QUADRANTS, quadrant, ofPlan, blockLabel, canWire, sendToPlan, bringInPlan, CONTEXT_KINDS } from '../platform/studio.js';
import { Viewport } from './Viewport.js';

/**
 * Assemble: a patching canvas, after Max/MSP and Scratch. Drag SOAR cards,
 * context factors, results and assets in from the bins; add goal and
 * objective blocks; then patch outlets (right) into inlets (left): ideas
 * and workplans into goals, goals into objectives, objectives into the
 * plan. "Send to plan" makes the objectives, goals and workplans in
 * Strategy & Work, and sending again updates them. "Bring in the plan" lays
 * the plan as it stands in Strategy & Work out on the canvas.
 *
 * Blocks linked to Strategy & Work show the title from there, and renaming
 * one renames it there straight away.
 */
const W = 2400;
const H = 1400;
const KIND = {
  card: { label: 'SOAR card' },
  context: { label: 'Context', color: '#b8860b' },
  asset: { label: 'Asset', color: '#59607a' },
  result: { label: 'Result', color: '#c4622d' },
  workplan: { label: 'Workplan', color: '#2a9d8f', editable: true },
  goal: { label: 'Goal', color: '#3d63dd', inlet: true, editable: true },
  objective: { label: 'Objective', color: '#1d2230', inlet: true, editable: true },
  plan: { label: 'Plan', color: '#7b4fc9', inlet: true, noOutlet: true, editable: true },
};
const COLUMN = { workplan: 40, goal: 400, objective: 760, plan: 1120 };

export function Assemble(ctx, plan) {
  const doc = ctx.doc;
  const blocks = ofPlan(doc, 'blocks', plan.id);
  const wires = ofPlan(doc, 'wires', plan.id);
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  const placed = (kind, ref) => blocks.some((b) => b.kind === kind && (b.ref === ref || b.asset?.id === ref));
  ctx.views ??= {};
  // Centre fits every block in view (never larger than 100%).
  const home = (w, hgt) => {
    if (!blocks.length) return { x: 20, y: 20, z: 1 };
    const box = blocks.reduce((m, b) => ({ x0: Math.min(m.x0, b.x), y0: Math.min(m.y0, b.y), x1: Math.max(m.x1, b.x + 260), y1: Math.max(m.y1, b.y + 140) }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const z = Math.max(0.25, Math.min(1, (w - 60) / (box.x1 - box.x0), (hgt - 80) / (box.y1 - box.y0)));
    return { x: 30 - box.x0 * z, y: 20 - box.y0 * z, z };
  };
  const vp = Viewport(ctx.views[`assemble:${plan.id}`] ??= {}, { home, min: 0.25, max: 2 });
  vp.el.classList.add('patch-vp');
  const patch = h('div', { class: 'patch', 'data-pan': '', style: `width:${W}px;height:${H}px` });
  const wireLayer = svg('svg', { class: 'patch-wires', width: W, height: H });
  vp.world.append(patch);
  patch.append(wireLayer);
  const z = () => vp.view.z;

  // Where to drop something added by clicking: the next free row in its column.
  const spot = (kind) => {
    const x = COLUMN[kind] ?? 40;
    const ys = blocks.filter((b) => Math.abs(b.x - x) < 200).map((b) => b.y);
    let y = 30;
    while (ys.some((v) => Math.abs(v - y) < 90)) y += 100;
    return { x, y };
  };
  const addBlock = (data, at) => ctx.add('blocks', { planId: plan.id, title: null, strategyId: null, ref: null, ...data, ...(at ?? spot(data.kind)) });

  // The bins: everything that can be patched in.
  const cards = ofPlan(doc, 'cards', plan.id);
  const assets = cards.flatMap((c) => (c.assets ?? []).map((a) => ({ ...a, from: c })));
  const chip = (label, data, sub, color) => {
    const used = data.kind === 'asset' ? placed('asset', data.asset.id) : placed(data.kind, data.ref);
    return h('li', {}, h('button', {
      class: `bin-chip${used ? ' used' : ''}`, draggable: 'true', style: color ? `--c:${color}` : null,
      title: used ? 'Already on the canvas (click to add another)' : 'Drag onto the canvas, or click to add it',
      ondragstart: (e) => { e.dataTransfer.setData('application/x-studio-block', JSON.stringify(data)); e.dataTransfer.effectAllowed = 'copy'; },
      onclick: () => addBlock(data),
    }, h('span', { class: 'bin-chip-text' }, label || '(blank)', sub && h('small', {}, sub))));
  };
  // Which bins are open is remembered through redraws, so clicking a chip leaves the list as it was.
  ctx.binOpen ??= {};
  const bin = (title, items, open = true) => {
    const el = h('details', { class: 'bin', open: ctx.binOpen[title] ?? open }, h('summary', {}, title, h('span', { class: 'badge badge-xs badge-ghost' }, items.length)), h('ul', {}, items));
    el.addEventListener('toggle', () => { ctx.binOpen[title] = el.open; });
    return el;
  };
  const planOnCanvas = blocks.some((b) => b.kind === 'plan');
  const bringIn = () => {
    const ops = bringInPlan(doc, ctx.strategy.doc, plan.id);
    if (!ops.length) { alert('Everything in the plan is already on the canvas.'); return; }
    ctx.store.apply(col.batch(ops));
  };
  const bins = h('aside', { class: 'patch-bins', 'aria-label': 'Things to patch in' },
    h('div', { class: 'bin-add' },
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => addBlock({ kind: 'goal', title: 'New goal' }) }, icon('plus', 14), 'Goal'),
      h('button', { class: 'btn btn-sm btn-outline', onclick: () => addBlock({ kind: 'objective', title: 'New objective' }) }, icon('plus', 14), 'Objective'),
      h('button', { class: 'btn btn-sm btn-outline bin-add-wp', title: 'A workplan: wire it into a goal', onclick: () => addBlock({ kind: 'workplan', title: 'New workplan' }) }, icon('plus', 14), 'Workplan'),
      h('button', { class: 'btn btn-sm btn-soft bin-add-plan', title: planOnCanvas ? 'Add anything from Strategy & Work that isn’t on the canvas yet' : 'Lay out the plan, its objectives, goals and workplans from Strategy & Work', onclick: bringIn }, icon('strategy', 14), planOnCanvas ? 'Bring in the rest of the plan' : 'Bring in the plan')),
    QUADRANTS.map((q) => bin(q.label, cards.filter((c) => c.quadrant === q.id).sort((a, b) => b.votes.length - a.votes.length)
      .map((c) => chip(c.text, { kind: 'card', ref: c.id }, c.votes.length ? `● ${c.votes.length}` : null, q.color)), q.id !== 'r')),
    bin('Results framework', ofPlan(doc, 'results', plan.id).map((r) => chip(r.title, { kind: 'result', ref: r.id }, r.indicator, KIND.result.color))),
    bin('Context', ofPlan(doc, 'context', plan.id).map((c) => chip(c.text, { kind: 'context', ref: c.id }, CONTEXT_KINDS.find((k) => k.id === c.kind)?.label, KIND.context.color))),
    bin('Assets', assets.map((a) => chip(a.label, { kind: 'asset', asset: { id: a.id, kind: a.kind, ref: a.ref, mapId: a.mapId, label: a.label, url: a.url }, title: a.label }, kindById[a.kind]?.label, KIND.asset.color)), false));

  // Keep the bins where they were scrolled to through redraws.
  ctx.binScroll ??= {};
  bins.addEventListener('scroll', () => { ctx.binScroll[plan.id] = bins.scrollTop; }, { passive: true });
  queueMicrotask(() => { bins.scrollTop = ctx.binScroll[plan.id] ?? 0; });

  patch.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-studio-block')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  patch.addEventListener('drop', (e) => {
    const raw = e.dataTransfer.getData('application/x-studio-block');
    if (!raw) return;
    e.preventDefault();
    const r = patch.getBoundingClientRect();
    addBlock(JSON.parse(raw), { x: Math.round(Math.max(0, (e.clientX - r.left) / z() - 90)), y: Math.round(Math.max(0, (e.clientY - r.top) / z() - 20)) });
  });

  // Blocks.
  const els = {};
  for (const b of blocks) els[b.id] = patch.appendChild(Block(ctx, b, doc, wires, z));

  // Wires, drawn once the blocks are laid out.
  const port = (id, side) => {
    const el = els[id];
    if (!el) return null;
    const p = el.querySelector(side === 'out' ? '.outlet' : '.inlet');
    if (!p) return null;
    return { x: el.offsetLeft + p.offsetLeft + p.offsetWidth / 2, y: el.offsetTop + p.offsetTop + p.offsetHeight / 2 };
  };
  const curve = (a, b) => { const dx = Math.max(40, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
  const drawWires = () => {
    wireLayer.replaceChildren();
    for (const w of wires) {
      const a = port(w.from, 'out');
      const b = port(w.to, 'in');
      if (!a || !b) continue;
      const from = byId[w.from];
      const color = from.kind === 'card' ? quadrant(doc.cards[from.ref]?.quadrant)?.color : KIND[from.kind]?.color;
      const g = svg('g', { class: `patch-wire${ctx.selWire === w.id ? ' on' : ''}` }, wireLayer);
      svg('path', { d: curve(a, b), class: 'wire-hit' }, g).addEventListener('click', () => { ctx.selWire = ctx.selWire === w.id ? null : w.id; ctx.render(); });
      svg('path', { d: curve(a, b), class: 'wire-line', stroke: color ?? '#59607a' }, g);
      if (ctx.selWire === w.id) {
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        patch.append(h('button', { class: 'btn btn-xs btn-error wire-remove', style: `left:${mid.x}px;top:${mid.y}px`, onclick: () => { ctx.selWire = null; ctx.remove('wires', w.id); } }, 'Remove wire'));
      }
    }
  };
  ctx.redrawWires = drawWires;
  requestAnimationFrame(drawWires);

  // Patching: drag from an outlet to an inlet.
  patch.addEventListener('pointerdown', (e) => {
    const out = e.target.closest('.outlet');
    if (!out || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const fromId = out.closest('.block').dataset.id;
    const a = port(fromId, 'out');
    const temp = svg('path', { class: 'wire-temp', d: '' }, wireLayer);
    ctx.dragging = true;
    patch.classList.add('patching');
    for (const el of patch.querySelectorAll('.block')) el.classList.toggle('can-take', canWire(byId[fromId], byId[el.dataset.id]));
    const at = (ev) => { const r = patch.getBoundingClientRect(); return { x: (ev.clientX - r.left) / z(), y: (ev.clientY - r.top) / z() }; };
    const move = (ev) => temp.setAttribute('d', curve(a, at(ev)));
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      temp.remove();
      patch.classList.remove('patching');
      ctx.endDrag();
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.block');
      const toId = target?.dataset.id;
      if (!toId || !canWire(byId[fromId], byId[toId])) { ctx.render(); return; }
      if (wires.some((w) => w.from === fromId && w.to === toId)) { ctx.render(); return; }
      ctx.add('wires', { planId: plan.id, from: fromId, to: toId });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  const send = () => {
    const out = sendToPlan(doc, ctx.strategy.doc, plan.id);
    if (!out.made && !out.updated) { alert('Add an objective block, and wire goals (and workplans into those) into it, to send them to the plan.'); return; }
    const msg = [`This makes ${out.made} new and updates ${out.updated} existing objectives, goals and workplans in “${plan.title}” in Strategy & Work.`,
      out.loose && `${out.loose} goal${out.loose === 1 ? ' isn’t' : 's aren’t'} wired into an objective yet, so ${out.loose === 1 ? 'it stays' : 'they stay'} here.`].filter(Boolean).join('\n\n');
    if (!confirm(msg)) return;
    ctx.strategy.apply(col.batch(out.strategyOps));
    if (out.studioOps.length) ctx.store.apply(col.batch(out.studioOps));
    ctx.flash = { text: `Sent to Strategy & Work: ${out.made} made, ${out.updated} updated.`, until: Date.now() + 10000 };
    ctx.render();
  };
  // The note stays up a while, through redraws from other people's saves.
  const flash = ctx.flash?.until > Date.now() ? ctx.flash.text : null;

  return h('div', { class: 'assemble' },
    h('div', { class: 'assemble-bar' },
      h('p', { class: 'muted' }, 'Drag ideas in from the left. Patch an outlet ', h('span', { class: 'port-demo out' }), ' into an inlet ', h('span', { class: 'port-demo in' }), ': ideas and workplans into goals, goals into objectives, objectives into the plan. Click a wire to remove it.'),
      h('span', { class: 'spacer' }),
      flash && h('span', { class: 'badge badge-success badge-soft', role: 'status' }, flash, ' ', h('a', { class: 'link', href: `strategy.html#${plan.id}` }, 'Open')),
      h('button', { class: 'btn btn-sm btn-primary', onclick: send }, icon('upload', 14), 'Send to plan')),
    h('div', { class: 'assemble-body' }, bins, vp.el));
}

function Block(ctx, b, doc, wires, z) {
  const k = KIND[b.kind];
  const card = b.kind === 'card' ? doc.cards[b.ref] : null;
  const q = card && quadrant(card.quadrant);
  const color = q?.color ?? k.color;
  const inPlan = b.strategyId && ctx.strategy.doc.nodes[b.strategyId];
  const feeds = wires.filter((w) => w.to === b.id).length;
  const editable = !!k.editable;
  const title = inPlan?.title ?? b.title;
  const rename = (e) => {
    const next = e.target.value.trim() || k.label;
    ctx.put('blocks', b.id, { title: next });
    if (inPlan && next !== inPlan.title) ctx.strategy.apply(strategyOps.update(inPlan.id, { title: next }));
  };
  const tasks = b.kind === 'workplan' && inPlan ? taskSummary(ctx.strategy.doc, inPlan.id).total : null;
  const el = h('div', { class: `block kind-${b.kind}${editable ? ' big' : ''}`, style: `left:${b.x}px;top:${b.y}px;--c:${color}`, 'data-id': b.id },
    k.inlet && h('span', { class: 'inlet', title: { goal: 'Inlet: wire ideas and workplans in', objective: 'Inlet: wire goals and ideas in', plan: 'Inlet: wire objectives in' }[b.kind] }),
    h('div', { class: 'block-head', onpointerdown: (e) => dragBlock(ctx, el, b, e, z) },
      h('span', {}, q ? q.label.replace(/s$/, '').replace(/ie$/, 'y') : k.label),
      editable && feeds > 0 && h('small', {}, `${feeds} in`),
      h('span', { class: 'spacer' }),
      inPlan && h('a', { class: 'block-link', href: `strategy.html#${b.strategyId}`, title: 'In Strategy & Work: open it', onpointerdown: (e) => e.stopPropagation() }, '✓ in plan'),
      h('button', { class: 'block-x', title: 'Remove from the canvas', 'aria-label': 'Remove block', onpointerdown: (e) => e.stopPropagation(),
        onclick: () => {
          ctx.remove('wires', wires.filter((w) => w.from === b.id || w.to === b.id).map((w) => w.id));
          ctx.remove('blocks', b.id);
        } }, '×')),
    editable
      ? h('textarea', { class: 'block-title', name: `bl-${b.id}`, rows: 2, 'aria-label': `${k.label} title`, onchange: rename }, title)
      : h('div', { class: 'block-text' }, b.kind === 'asset' ? [icon(kindById[b.asset?.kind]?.icon ?? 'doc', 14), ' '] : null, blockLabel(doc, b)),
    b.kind === 'workplan' && h('div', { class: 'block-foot' },
      inPlan
        ? [h('span', {}, `${tasks} task${tasks === 1 ? '' : 's'}`), h('a', { class: 'link', href: `strategy.html#${inPlan.id}`, onpointerdown: (e) => e.stopPropagation() }, 'Dates, people & tasks →')]
        : h('span', { class: 'muted' }, 'Wire into a goal, then Send to plan')),
    !k.noOutlet && h('span', { class: 'outlet', title: { workplan: 'Outlet: drag to a goal', goal: 'Outlet: drag to an objective', objective: 'Outlet: drag to the plan' }[b.kind] ?? 'Outlet: drag to a goal or objective' }));
  return el;
}

function dragBlock(ctx, el, b, e, z) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const start = { x: e.clientX, y: e.clientY };
  ctx.dragging = true;
  el.classList.add('dragging');
  let pos = { x: b.x, y: b.y };
  const move = (ev) => {
    pos = { x: Math.max(0, Math.min(W - 180, b.x + (ev.clientX - start.x) / z())), y: Math.max(0, Math.min(H - 60, b.y + (ev.clientY - start.y) / z())) };
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    ctx.redrawWires?.();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    el.classList.remove('dragging');
    ctx.endDrag();
    if (pos.x !== b.x || pos.y !== b.y) ctx.put('blocks', b.id, { x: Math.round(pos.x), y: Math.round(pos.y) });
    else ctx.render();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

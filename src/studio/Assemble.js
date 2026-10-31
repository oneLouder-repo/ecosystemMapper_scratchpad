import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { svg } from '../core/svg.js';
import { col } from '../core/collections.js';
import { kindById } from '../platform/assets.js';
import { QUADRANTS, quadrant, ofPlan, blockLabel, canWire, sendToPlan, CONTEXT_KINDS } from '../platform/studio.js';

/**
 * Assemble: a patching canvas, after Max/MSP and Scratch. Drag SOAR cards,
 * context factors, results and assets in from the bins; add goal and
 * objective blocks; then patch outlets (right) into inlets (left): ideas
 * into goals, goals into objectives. "Send to plan" makes the objectives
 * and goals in Strategy & Work, and sending again updates them.
 */
const W = 2400;
const H = 1400;
const KIND = {
  card: { label: 'SOAR card' },
  context: { label: 'Context', color: '#b8860b' },
  asset: { label: 'Asset', color: '#59607a' },
  result: { label: 'Result', color: '#c4622d' },
  goal: { label: 'Goal', color: '#3d63dd', inlet: true },
  objective: { label: 'Objective', color: '#1d2230', inlet: true, noOutlet: true },
};

export function Assemble(ctx, plan) {
  const doc = ctx.doc;
  const blocks = ofPlan(doc, 'blocks', plan.id);
  const wires = ofPlan(doc, 'wires', plan.id);
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  const placed = (kind, ref) => blocks.some((b) => b.kind === kind && (b.ref === ref || b.asset?.id === ref));
  const scroller = h('div', { class: 'patch-scroll' });
  const patch = h('div', { class: 'patch', style: `width:${W}px;height:${H}px` });
  const wireLayer = svg('svg', { class: 'patch-wires', width: W, height: H });
  scroller.append(patch);
  patch.append(wireLayer);

  // Where to drop something added by clicking: the next free row in its column.
  const spot = (kind) => {
    const x = kind === 'objective' ? 760 : kind === 'goal' ? 400 : 40;
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
  const bin = (title, items, open = true) => h('details', { class: 'bin', open }, h('summary', {}, title, h('span', { class: 'badge badge-xs badge-ghost' }, items.length)), h('ul', {}, items));
  const bins = h('aside', { class: 'patch-bins', 'aria-label': 'Things to patch in' },
    h('div', { class: 'bin-add' },
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => addBlock({ kind: 'goal', title: 'New goal' }) }, icon('plus', 14), 'Goal'),
      h('button', { class: 'btn btn-sm btn-outline', onclick: () => addBlock({ kind: 'objective', title: 'New objective' }) }, icon('plus', 14), 'Objective')),
    QUADRANTS.map((q) => bin(q.label, cards.filter((c) => c.quadrant === q.id).sort((a, b) => b.votes.length - a.votes.length)
      .map((c) => chip(c.text, { kind: 'card', ref: c.id }, c.votes.length ? `● ${c.votes.length}` : null, q.color)), q.id !== 'r')),
    bin('Results framework', ofPlan(doc, 'results', plan.id).map((r) => chip(r.title, { kind: 'result', ref: r.id }, r.indicator, KIND.result.color))),
    bin('Context', ofPlan(doc, 'context', plan.id).map((c) => chip(c.text, { kind: 'context', ref: c.id }, CONTEXT_KINDS.find((k) => k.id === c.kind)?.label, KIND.context.color))),
    bin('Assets', assets.map((a) => chip(a.label, { kind: 'asset', asset: { id: a.id, kind: a.kind, ref: a.ref, mapId: a.mapId, label: a.label, url: a.url }, title: a.label }, kindById[a.kind]?.label, KIND.asset.color)), false));

  patch.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-studio-block')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  patch.addEventListener('drop', (e) => {
    const raw = e.dataTransfer.getData('application/x-studio-block');
    if (!raw) return;
    e.preventDefault();
    const r = patch.getBoundingClientRect();
    addBlock(JSON.parse(raw), { x: Math.max(0, e.clientX - r.left - 90), y: Math.max(0, e.clientY - r.top - 20) });
  });

  // Blocks.
  const els = {};
  for (const b of blocks) els[b.id] = patch.appendChild(Block(ctx, b, doc, wires));

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
    const fromId = out.closest('.block').dataset.id;
    const a = port(fromId, 'out');
    const temp = svg('path', { class: 'wire-temp', d: '' }, wireLayer);
    ctx.dragging = true;
    patch.classList.add('patching');
    for (const el of patch.querySelectorAll('.block')) el.classList.toggle('can-take', canWire(byId[fromId], byId[el.dataset.id]));
    const at = (ev) => { const r = patch.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
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
    if (!out.made && !out.updated) { alert('Add an objective block, and wire goals into it, to send them to the plan.'); return; }
    const msg = [`This makes ${out.made} new and updates ${out.updated} existing objectives and goals in “${plan.title}” in Strategy & Work.`,
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
      h('p', { class: 'muted' }, 'Drag ideas in from the left. Patch an outlet ', h('span', { class: 'port-demo out' }), ' into an inlet ', h('span', { class: 'port-demo in' }), ': ideas into goals, goals into objectives. Click a wire to remove it.'),
      h('span', { class: 'spacer' }),
      flash && h('span', { class: 'badge badge-success badge-soft', role: 'status' }, flash, ' ', h('a', { class: 'link', href: `strategy.html#${plan.id}` }, 'Open')),
      h('button', { class: 'btn btn-sm btn-primary', onclick: send }, icon('upload', 14), 'Send to plan')),
    h('div', { class: 'assemble-body' }, bins, scroller));
}

function Block(ctx, b, doc, wires) {
  const k = KIND[b.kind];
  const card = b.kind === 'card' ? doc.cards[b.ref] : null;
  const q = card && quadrant(card.quadrant);
  const color = q?.color ?? k.color;
  const inPlan = b.strategyId && ctx.strategy.doc.nodes[b.strategyId];
  const feeds = wires.filter((w) => w.to === b.id).length;
  const editable = b.kind === 'goal' || b.kind === 'objective';
  const el = h('div', { class: `block kind-${b.kind}${editable ? ' big' : ''}`, style: `left:${b.x}px;top:${b.y}px;--c:${color}`, 'data-id': b.id },
    k.inlet && h('span', { class: 'inlet', title: b.kind === 'goal' ? 'Inlet: wire ideas in' : 'Inlet: wire goals and ideas in' }),
    h('div', { class: 'block-head', onpointerdown: (e) => dragBlock(ctx, el, b, e) },
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
      ? h('textarea', { class: 'block-title', name: `bl-${b.id}`, rows: 2, 'aria-label': `${k.label} title`, onchange: (e) => ctx.put('blocks', b.id, { title: e.target.value.trim() || k.label }) }, b.title)
      : h('div', { class: 'block-text' }, b.kind === 'asset' ? [icon(kindById[b.asset?.kind]?.icon ?? 'doc', 14), ' '] : null, blockLabel(doc, b)),
    !k.noOutlet && h('span', { class: 'outlet', title: 'Outlet: drag to a goal or objective' }));
  return el;
}

function dragBlock(ctx, el, b, e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const start = { x: e.clientX, y: e.clientY };
  ctx.dragging = true;
  el.classList.add('dragging');
  let pos = { x: b.x, y: b.y };
  const move = (ev) => {
    pos = { x: Math.max(0, Math.min(W - 180, b.x + ev.clientX - start.x)), y: Math.max(0, Math.min(H - 60, b.y + ev.clientY - start.y)) };
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

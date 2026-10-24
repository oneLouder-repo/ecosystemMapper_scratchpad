import { h } from '../ui/dom.js';
import { svg, setAttrs } from '../core/svg.js';
import { descendants, statusById, strategyOps } from '../platform/strategy.js';
import { addDays, daysBetween, monthLabel, monthStarts, short, today } from './dates.js';

const ROW = 30;
const HEAD = 40;
const SCALES = { weeks: 14, months: 4, quarters: 1.6 };
let scale = 'months';

/**
 * Gantt chart of every workplan under a node and their tasks.
 * Drag a task bar to move it, drag either end to change its dates,
 * click it to open the task. The drag is drawn live and saved as one
 * undoable change when you let go.
 */
export function Gantt(ctx, nodeId) {
  const { store, select } = ctx;
  const doc = store.doc;
  const node = doc.nodes[nodeId];
  const workplans = node.type === 'workplan' ? [node] : descendants(doc, nodeId).filter((n) => n.type === 'workplan');
  if (!workplans.length) return h('p', { class: 'muted' }, 'No workplans under this yet.');

  const rows = [];
  for (const wp of workplans) {
    rows.push({ node: wp, kind: 'workplan' });
    for (const t of descendants(doc, wp.id).filter((n) => n.type === 'task')) rows.push({ node: t, kind: 'task' });
  }

  const dated = rows.map((r) => r.node).filter((n) => n.start && n.end);
  const now = today();
  const from = addDays([...dated.map((n) => n.start), now].sort()[0], -10);
  const to = addDays([...dated.map((n) => n.end), now].sort().at(-1), 20);
  const dayW = SCALES[scale];
  const width = daysBetween(from, to) * dayW;
  const height = HEAD + rows.length * ROW;
  const xOf = (d) => daysBetween(from, d) * dayW;

  const chart = svg('svg', { class: 'gantt-svg', width, height });
  // Month grid and labels
  for (const m of monthStarts(from.slice(0, 8) + '01', to)) {
    const x = xOf(m);
    svg('line', { class: 'gantt-grid', x1: x, x2: x, y1: HEAD - 8, y2: height }, chart);
    if (scale !== 'quarters' || ['01', '04', '07', '10'].includes(m.slice(5, 7))) {
      svg('text', { class: 'gantt-month', x: x + 4, y: 22 }, chart).textContent = monthLabel(m);
    }
  }
  rows.forEach((r, i) => {
    if (r.kind === 'workplan') svg('rect', { class: 'gantt-band', x: 0, y: HEAD + i * ROW, width, height: ROW }, chart);
  });

  rows.forEach((r, i) => {
    const n = r.node;
    if (!n.start || !n.end) return;
    const y = HEAD + i * ROW;
    const g = svg('g', { class: `gantt-bar ${r.kind}`, 'data-id': n.id }, chart);
    const x = xOf(n.start);
    const w = Math.max(dayW, xOf(addDays(n.end, 1)) - x);
    if (r.kind === 'workplan') {
      svg('rect', { class: 'bar wp', x, y: y + 11, width: w, height: 8 }, g);
      return;
    }
    const bar = svg('rect', { class: 'bar', x, y: y + 6, width: w, height: ROW - 12, fill: statusById[n.status]?.color }, g);
    const lh = svg('rect', { class: 'grip', x: x - 3, y: y + 6, width: 7, height: ROW - 12, 'data-edge': 'start' }, g);
    const rh = svg('rect', { class: 'grip', x: x + w - 4, y: y + 6, width: 7, height: ROW - 12, 'data-edge': 'end' }, g);
    if (n.id === ctx.selectedId) g.classList.add('selected');
    attachDrag(g, { bar, lh, rh, x, w, dayW, node: n, ctx });
  });

  const tx = xOf(now);
  svg('line', { class: 'gantt-today', x1: tx, x2: tx, y1: HEAD - 14, y2: height }, chart);
  svg('text', { class: 'gantt-today-label', x: tx + 4, y: HEAD - 4 }, chart).textContent = 'Today';

  const labels = h('div', { class: 'gantt-labels', style: `padding-top:${HEAD}px` },
    rows.map((r) =>
      h('button', {
        class: `gantt-label ${r.kind}${r.node.id === ctx.selectedId ? ' selected' : ''}`,
        title: `${r.node.title} · ${short(r.node.start)} – ${short(r.node.end)}`,
        onclick: () => select(r.node.id),
      }, r.kind === 'task' && h('span', { class: 'dot', style: `background:${statusById[r.node.status]?.color}` }), r.node.title)));

  const scroller = h('div', { class: 'gantt-scroll' }, chart);
  // Start scrolled so today is in view.
  requestAnimationFrame(() => { scroller.scrollLeft = Math.max(0, tx - scroller.clientWidth / 3); });

  return h('div', { class: 'gantt' },
    h('div', { class: 'gantt-tools' },
      h('span', { class: 'muted' }, 'Drag bars to reschedule, drag their ends to change dates.'),
      h('div', { class: 'segmented small' },
        Object.keys(SCALES).map((s) => h('button', { class: s === scale ? 'on' : '', onclick: () => { scale = s; ctx.render(); } }, s[0].toUpperCase() + s.slice(1)))),
    ),
    h('div', { class: 'gantt-body' }, labels, scroller),
  );

  function attachDrag(g, { bar, lh, rh, x, w, dayW: dw, node: n, ctx: c }) {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const edge = e.target.dataset.edge ?? 'move';
      const startX = e.clientX;
      let days = 0;
      g.setPointerCapture(e.pointerId);
      g.classList.add('dragging');
      const move = (ev) => {
        days = Math.round((ev.clientX - startX) / dw);
        const nx = edge === 'end' ? x : x + days * dw;
        const nw = edge === 'move' ? w : edge === 'start' ? w - days * dw : w + days * dw;
        if (nw < dw) return;
        setAttrs(bar, { x: nx, width: nw });
        setAttrs(lh, { x: nx - 3 });
        setAttrs(rh, { x: nx + nw - 4 });
      };
      const up = () => {
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
        g.classList.remove('dragging');
        if (!days) {
          c.select(n.id);
          return;
        }
        const start = edge === 'end' ? n.start : addDays(n.start, days);
        const end = edge === 'start' ? n.end : addDays(n.end, days);
        if (start > end) return c.render();
        c.store.apply(strategyOps.update(n.id, { start, end }));
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
    });
  }
}

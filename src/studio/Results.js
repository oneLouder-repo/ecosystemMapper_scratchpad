import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { measureIndex } from '../platform/strategy.js';
import { ofPlan } from '../platform/studio.js';

/**
 * Results: the beginnings of the plan's monitoring and evaluation
 * framework, laid out on a dashboard grid. Each card is a result with how
 * it will be measured (indicator, baseline, target, source, how often). A
 * card can point at a measure in Strategy & Work, and on the Assemble canvas
 * a result wired into a goal becomes that goal's measure.
 *
 * Drag a card by its top strip to move it; drag its corner to resize it.
 */
const COLS = 12;
const ROW = 56;
const FREQ = ['Monthly', 'Quarterly', 'Twice a year', 'Yearly', 'At the end'].map((x) => ({ id: x, label: x }));

export function Results(ctx, plan) {
  const results = ofPlan(ctx.doc, 'results', plan.id);
  const rCards = ofPlan(ctx.doc, 'cards', plan.id).filter((c) => c.quadrant === 'r');
  const waiting = rCards.filter((c) => !results.some((r) => r.cardId === c.id));
  const measures = Object.values(measureIndex(ctx.strategy.doc));
  const bottom = () => results.reduce((m, r) => Math.max(m, r.y + r.h), 0);
  const make = (card) => ctx.add('results', {
    planId: plan.id, cardId: card?.id ?? null, title: card?.text ?? 'New result', indicator: '', baseline: '', target: '', unit: '',
    source: '', frequency: 'Quarterly', measureId: null, x: (results.length % 3) * 4, y: bottom(), w: 4, h: 5,
  });

  const grid = h('div', { class: 'results-grid', style: `--rows:${Math.max(8, bottom() + 4)};--row:${ROW}px` },
    results.map((r) => ResultCard(ctx, r, measures, results)));

  return h('div', { class: 'results-wrap' },
    h('div', { class: 'results-intro' },
      h('div', {}, h('h2', {}, 'Results framework'),
        h('p', { class: 'muted' }, 'How you will know the plan is working. Start from the Results on the SOAR board, then say how each one is measured. Link a measure from Strategy & Work to use its live data.')),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => make(null) }, icon('plus', 14), 'New result')),
    waiting.length > 0 && h('div', { class: 'results-tray' },
      h('span', { class: 'fieldset-legend' }, 'From the SOAR board'),
      waiting.map((c) => h('button', { class: 'btn btn-sm btn-soft', title: 'Make this a result card', onclick: () => make(c) }, icon('plus', 13), c.text || '(blank card)'))),
    !results.length && h('p', { class: 'empty' }, 'No results yet.'),
    grid);
}

function ResultCard(ctx, r, measures, all) {
  const set = (patch) => ctx.put('results', r.id, patch);
  const f = (key, label, attrs = {}) => h('label', { class: 'rf' }, h('span', {}, label),
    h('input', { class: 'input input-xs', name: `r-${r.id}-${key}`, value: r[key] ?? '', onchange: (e) => set({ [key]: e.target.value }), ...attrs }));
  const linked = measures.find((m) => m.id === r.measureId);
  const card = h('article', { class: 'result-card card card-border bg-base-100', style: `grid-column:${r.x + 1} / span ${r.w};grid-row:${r.y + 1} / span ${r.h}`, 'data-id': r.id },
    h('div', { class: 'result-grip', title: 'Drag to move', onpointerdown: (e) => drag(ctx, card, r, all, e, 'move') },
      icon('chart', 14), h('span', {}, 'Result'), h('span', { class: 'spacer' }),
      linked && h('span', { class: 'badge badge-xs badge-success badge-soft', title: `Uses ${linked.name} in Strategy & Work` }, 'live data'),
      h('button', { class: 'btn btn-ghost btn-xs btn-square', title: 'Remove', 'aria-label': 'Remove result', onpointerdown: (e) => e.stopPropagation(),
        onclick: () => { if (confirm('Remove this result?')) ctx.remove('results', r.id); } }, '×')),
    h('div', { class: 'result-body' },
      h('textarea', { class: 'result-title', name: `r-${r.id}-title`, rows: 2, 'aria-label': 'Result', onchange: (e) => set({ title: e.target.value }) }, r.title),
      h('div', { class: 'rf-grid' },
        h('label', { class: 'rf wide' }, h('span', {}, 'Measure in Strategy & Work'),
          h('select', { class: 'select select-xs', name: `r-${r.id}-m`, onchange: (e) => {
            const m = measures.find((x) => x.id === e.target.value);
            set(m ? { measureId: m.id, indicator: r.indicator || m.name, target: r.target || m.target, unit: r.unit || m.unit } : { measureId: null });
          } }, h('option', { value: '' }, 'None yet'), options(measures.map((m) => ({ id: m.id, label: m.name })), r.measureId))),
        f('indicator', 'Indicator', { placeholder: 'What you count', class: 'input input-xs' }),
        f('unit', 'Unit', { placeholder: 'youth, %…' }),
        f('baseline', 'Baseline'),
        f('target', 'Target'),
        f('source', 'Data source', { placeholder: 'Survey, registrations…' }),
        h('label', { class: 'rf' }, h('span', {}, 'How often'),
          h('select', { class: 'select select-xs', name: `r-${r.id}-f`, onchange: (e) => set({ frequency: e.target.value }) }, options(FREQ, r.frequency))))),
    h('span', { class: 'result-resize', title: 'Drag to resize', onpointerdown: (e) => drag(ctx, card, r, all, e, 'size') }));
  return card;
}

/** Move or resize a card on the grid, snapping to cells, then nudge anything it lands on downwards. */
function drag(ctx, card, r, all, e, mode) {
  if (e.button !== 0) return;
  e.preventDefault();
  const grid = card.parentElement;
  const g = grid.getBoundingClientRect();
  const colW = g.width / COLS;
  const start = { x: e.clientX, y: e.clientY };
  let next = { x: r.x, y: r.y, w: r.w, h: r.h };
  ctx.dragging = true;
  card.classList.add('dragging');
  const move = (ev) => {
    const dc = Math.round((ev.clientX - start.x) / colW);
    const dr = Math.round((ev.clientY - start.y) / ROW);
    next = mode === 'move'
      ? { ...next, x: clamp(r.x + dc, 0, COLS - r.w), y: Math.max(0, r.y + dr) }
      : { ...next, w: clamp(r.w + dc, 3, COLS - r.x), h: Math.max(3, r.h + dr) };
    card.style.gridColumn = `${next.x + 1} / span ${next.w}`;
    card.style.gridRow = `${next.y + 1} / span ${next.h}`;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    card.classList.remove('dragging');
    ctx.endDrag();
    if (next.x === r.x && next.y === r.y && next.w === r.w && next.h === r.h) return;
    ctx.put('results', r.id, next);
    for (const [id, patch] of settle(all.map((x) => (x.id === r.id ? { ...x, ...next } : x)), r.id)) ctx.put('results', id, patch);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/** Cards under the moved one slide down below it, and so on. Returns [[id, { y }]]. */
export function settle(cards, movedId) {
  const list = cards.map((c) => ({ ...c }));
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const changed = new Map();
  const queue = [list.find((c) => c.id === movedId)];
  while (queue.length) {
    const a = queue.shift();
    for (const b of list) {
      if (b.id === a.id || b.id === movedId || !hit(a, b)) continue;
      b.y = a.y + a.h;
      changed.set(b.id, { y: b.y });
      queue.push(b);
    }
  }
  return [...changed];
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

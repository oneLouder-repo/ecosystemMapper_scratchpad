import { h } from '../ui/dom.js';
import { svg } from '../core/svg.js';
import { NODE_TYPES, rootOf, childrenOf, taskSummary, measureIndex } from '../platform/strategy.js';
import { strategyTree, squarify, strategyCounts } from '../platform/strategyReports.js';
import { range } from './dates.js';

// Categorical hues for objectives, in a fixed order (validated for colour
// vision differences next to each other). Past eight, objectives go grey.
const HUES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const OTHER = '#8a90a0';
// How strongly each level is tinted with its objective's hue.
const TINT = { framework: 0, plan: 6, objective: 30, goal: 18, workplan: 10 };

/** The landing tab: the framework's purpose, its shape in numbers, and a treemap down to workplans. */
export function Overview(ctx) {
  const doc = ctx.store.doc;
  const root = rootOf(doc);
  if (!root) return h('p', { class: 'empty' }, 'No strategy yet.');
  const counts = strategyCounts(doc);
  const tasks = taskSummary(doc, root.id);
  const plans = childrenOf(doc, root.id).filter((n) => n.type === 'plan');
  const banner = h('div', { class: 'treemap-wrap' });
  const draw = () => banner.replaceChildren(Treemap(doc, Math.max(320, banner.clientWidth)));
  new ResizeObserver(draw).observe(banner);
  const tile = (label, value, hint) => h('div', { class: 'stat-tile' }, h('span', {}, label), h('strong', {}, value), hint && h('small', {}, hint));
  const statement = (label, text) => text && h('div', { class: 'framework-statement' }, h('span', {}, label), h('p', {}, text));

  return h('div', { class: 'strategy-overview' },
    h('section', { class: 'framework-intro' },
      h('h2', {}, root.title || 'Strategic framework'),
      h('div', { class: 'framework-statements' },
        statement('Mission', root.mission),
        statement('Vision', root.vision),
        statement('Values', root.values))),
    h('figure', { class: 'treemap-figure' },
      banner,
      h('figcaption', { class: 'muted small' }, 'The whole framework, down to workplans. Each box’s size is its number of tasks; colour follows the strategic objective. The bar along the bottom of a workplan shows how many of its tasks are done. Click any box to open it.')),
    h('div', { class: 'stat-tiles' },
      tile('Plans', counts.plan, plans.map((p) => range(p.start, p.end)).join(', ')),
      tile('Objectives', counts.objective, `${counts.goal} goals`),
      tile('Workplans', counts.workplan, `${counts.task} tasks`),
      tile('Tasks done', tasks.total ? `${Math.round((tasks.done / tasks.total) * 100)}%` : '—', `${tasks.done} done · ${tasks.active + tasks.blocked} open · ${tasks.planned} to start`),
      tile('Measures', Object.keys(measureIndex(doc)).length, 'tracked on dashboards')),
    h('section', {},
      h('h2', {}, 'Plans and objectives'),
      h('ul', { class: 'overview-plans' }, plans.map((p) => PlanItem(doc, p)))));
}

function PlanItem(doc, plan) {
  const kids = childrenOf(doc, plan.id);
  return h('li', {},
    h('a', { href: `#${plan.id}` }, h('strong', {}, plan.title)), ' ', h('span', { class: 'muted' }, range(plan.start, plan.end)),
    kids.length > 0 && h('ul', {}, kids.map((k) => k.type === 'plan'
      ? PlanItem(doc, k)
      : h('li', {}, h('span', { class: 'glyph' }, NODE_TYPES[k.type].glyph), ' ', h('a', { href: `#${k.id}` }, k.title), ' ',
          h('span', { class: 'muted' }, `${childrenOf(doc, k.id).length} goals`)))));
}

const ellipsis = (text, px, size) => {
  const fit = Math.floor(px / (size * 0.56));
  return text.length <= fit ? text : fit > 3 ? `${text.slice(0, fit - 1)}…` : '';
};

/** A nested, squarified treemap of the framework, as clickable SVG. */
export function Treemap(doc, width, height = Math.round(Math.min(320, Math.max(240, width * 0.28)))) {
  const tree = strategyTree(doc);
  const el = svg('svg', { class: 'treemap', viewBox: `0 0 ${width} ${height}`, width, height, role: 'group', 'aria-label': 'Treemap of the strategic framework' });
  const order = [];
  const walk = (t) => { if (t.node.type === 'objective') order.push(t.node.id); t.children.forEach(walk); };
  walk(tree);
  const hueOf = (id) => (order.indexOf(id) >= 0 && order.indexOf(id) < HUES.length ? HUES[order.indexOf(id)] : OTHER);

  const draw = (t, r, hue) => {
    const n = t.node;
    if (n.type === 'objective') hue = hueOf(n.id);
    const link = svg('a', { href: `#${n.id}`, class: `tm-node tm-${n.type}` }, el);
    const tasks = taskSummary(doc, n.id);
    svg('title', {}, link).textContent = `${NODE_TYPES[n.type].label}: ${n.title}${tasks.total ? ` · ${tasks.done} of ${tasks.total} tasks done` : ''}`;
    const tint = hue ? TINT[n.type] : 0;
    svg('rect', { x: r.x, y: r.y, width: Math.max(0, r.w), height: Math.max(0, r.h), rx: 4,
      style: `fill: color-mix(in oklab, ${hue ?? OTHER} ${tint}%, var(--panel)); stroke: ${hue ? `color-mix(in oklab, ${hue} 60%, var(--panel))` : 'var(--line)'}` }, link);

    const big = r.w > 46 && r.h > 34;
    const header = n.type !== 'framework' && big && t.children.length ? 18 : 0;
    const label = ellipsis(n.title || 'Untitled', r.w - 10, n.type === 'workplan' ? 11 : 12);
    if (label && r.h > 16 && n.type !== 'framework') {
      const text = svg('text', { x: r.x + 6, y: r.y + 13, class: `tm-label tm-label-${n.type}` }, link);
      text.textContent = label;
    }
    if (n.type === 'workplan') {
      if (r.h > 30 && r.w > 40 && tasks.total) svg('text', { x: r.x + 6, y: r.y + 27, class: 'tm-sub' }, link).textContent = `${tasks.done}/${tasks.total} done`;
      // Completion along the bottom edge.
      if (tasks.total && r.w > 8 && r.h > 10) {
        svg('rect', { x: r.x + 3, y: r.y + r.h - 6, width: Math.max(0, r.w - 6), height: 3, rx: 1.5, class: 'tm-track' }, link);
        svg('rect', { x: r.x + 3, y: r.y + r.h - 6, width: Math.max(0, (r.w - 6) * (tasks.done / tasks.total)), height: 3, rx: 1.5, style: `fill:${hue ?? OTHER}` }, link);
      }
      return;
    }
    const pad = n.type === 'framework' ? 0 : 3;
    const inner = { x: r.x + pad, y: r.y + pad + header, w: r.w - pad * 2, h: r.h - pad * 2 - header };
    if (inner.w < 4 || inner.h < 4) return;
    for (const c of squarify(t.children, inner)) draw(c.item, c, hue);
  };
  if (tree) draw(tree, { x: 0, y: 0, w: width, h: height }, null);
  return el;
}

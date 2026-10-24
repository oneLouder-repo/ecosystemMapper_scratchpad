import { h } from '../ui/dom.js';
import { svg } from '../core/svg.js';
import { measureIndex, descendants, TASK_STATUSES, statusAt } from '../platform/strategy.js';
import { valueAt, pointsUntil } from '../platform/data.js';
import { monthLabel, addDays } from '../strategy/dates.js';

/**
 * Dashboard widgets. Each renders for one moment in time (`ctx.asOf`), so
 * the timeline player can step a whole dashboard through the months.
 *
 *   renderWidget(widget, { strategy, data, asOf, months }) → <figure>
 *
 * Charts follow a few fixed rules: one series per chart in one colour,
 * 2px lines with a 10% area wash, columns no wider than 24px with rounded
 * tops, hairline solid gridlines, text in ink colours (never the series
 * colour), a hover tooltip, and a table view for every chart.
 */
export function renderWidget(w, ctx) {
  const render = RENDERERS[w.type];
  if (!render) return h('figure', { class: 'widget' }, h('p', { class: 'muted' }, `Unknown widget: ${w.type}`));
  return render(w, ctx);
}

const fmt = (v, unit = '') => {
  if (v == null) return '—';
  if (unit.startsWith('%')) return `${(+v).toFixed(v % 1 ? 1 : 0)}%`;
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}K`;
  return Number(v).toLocaleString('en-CA');
};
const unitText = (unit = '') => (unit.startsWith('%') ? '' : unit);
const monthShort = (d) => monthLabel(d).replace(/ (\d\d)(\d\d)$/, ' ’$2');

function measureOf(w, ctx) {
  const m = measureIndex(ctx.strategy)[w.measureId];
  const series = ctx.data.series[w.measureId];
  return { m, series };
}

function figure(w, cls, title, body, table) {
  const tableId = `${w.id}-table`;
  const fig = h('figure', { class: `widget ${cls} size-${w.size ?? 'wide'}` },
    h('figcaption', {},
      h('span', { class: 'widget-title' }, title),
      table && h('button', { class: 'link-button', 'aria-controls': tableId, 'aria-expanded': 'false', onclick: (e) => {
        const t = fig.querySelector(`#${CSS.escape(tableId)}`);
        t.hidden = !t.hidden;
        e.currentTarget.setAttribute('aria-expanded', String(!t.hidden));
        e.currentTarget.textContent = t.hidden ? 'Table' : 'Chart only';
      } }, 'Table')),
    body,
    table && h('div', { id: tableId, hidden: true, class: 'widget-table' }, table),
  );
  return fig;
}

function dataTable(points, unit) {
  return h('table', { class: 'list compact' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Month'), h('th', {}, `Value${unit ? ` (${unit})` : ''}`))),
    h('tbody', {}, points.map((p) => h('tr', {}, h('td', {}, monthLabel(p.date)), h('td', {}, fmt(p.value, unit))))));
}

const missing = (w, what) => h('figure', { class: `widget size-${w.size}` }, h('p', { class: 'muted' }, `Choose a ${what} for this widget.`));

// ---------------------------------------------------------------- KPI
function kpi(w, ctx) {
  const { m, series } = measureOf(w, ctx);
  if (!m) return missing(w, 'measure');
  const now = valueAt(series, ctx.asOf);
  const before = now && valueAt(series, addDays(now.date, -365));
  const target = parseFloat(m.target);
  const share = now && target ? Math.min(1, now.value / target) : null;
  const change = now && before && before.date !== now.date ? now.value - before.value : null;
  return figure(w, 'kpi', w.title ?? m.name,
    h('div', { class: 'kpi-body' },
      h('div', { class: 'kpi-value' }, fmt(now?.value, m.unit), h('span', { class: 'kpi-unit' }, unitText(m.unit))),
      h('div', { class: 'kpi-meta' }, now ? `in ${monthLabel(now.date)}` : 'No data yet for this month'),
      share != null && h('div', { class: 'meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(target), 'aria-valuenow': String(now.value), 'aria-label': `${m.name} toward target` },
        h('div', { class: 'meter-fill', style: `width:${(share * 100).toFixed(1)}%` })),
      h('div', { class: 'kpi-meta' },
        target ? `${Math.round((share ?? 0) * 100)}% of the ${fmt(target, m.unit)} target` : '',
        change != null ? ` · ${change >= 0 ? '▲' : '▼'} ${fmt(Math.abs(change), m.unit)} on a year earlier` : ''),
    ));
}

// ---------------------------------------------------------------- line and bar
const W = 640;
const H = 240;
const PAD = { l: 48, r: 56, t: 16, b: 30 };

function frame(ctx, m, series, inset = 0) {
  const months = ctx.months.length ? ctx.months : series.points.map((p) => p.date);
  const all = series.points.map((p) => p.value);
  const target = parseFloat(m.target);
  const top = niceMax(Math.max(...all, Number.isFinite(target) && target < Math.max(...all) * 3 ? target : 0));
  const x = (d) => PAD.l + inset + (months.indexOf(d) / Math.max(1, months.length - 1)) * (W - PAD.l - PAD.r - 2 * inset);
  const y = (v) => PAD.t + (1 - v / top) * (H - PAD.t - PAD.b);
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img' });
  for (const t of ticks(top)) {
    svg('line', { class: 'grid', x1: PAD.l, x2: W - PAD.r, y1: y(t), y2: y(t) }, chart);
    svg('text', { class: 'axis', x: PAD.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, chart).textContent = fmt(t, m.unit);
  }
  months.forEach((d, i) => {
    if (i % Math.ceil(months.length / 6) && i !== months.length - 1) return;
    svg('text', { class: 'axis', x: x(d), y: H - 8, 'text-anchor': 'middle' }, chart).textContent = monthShort(d);
  });
  // Target as a reference line, only when it sits within the chart.
  if (Number.isFinite(target) && target <= top) {
    svg('line', { class: 'target', x1: PAD.l, x2: W - PAD.r, y1: y(target), y2: y(target) }, chart);
    svg('text', { class: 'axis target-label', x: PAD.l + 4, y: y(target) - 5 }, chart).textContent = `Target ${fmt(target, m.unit)}`;
  }
  return { chart, x, y, months };
}

function line(w, ctx) {
  const { m, series } = measureOf(w, ctx);
  if (!m || !series) return missing(w, 'measure');
  const { chart, x, y } = frame(ctx, m, series);
  const shown = pointsUntil(series, ctx.asOf);
  if (shown.length) {
    const d = shown.map((p, i) => `${i ? 'L' : 'M'} ${x(p.date)} ${y(p.value)}`).join(' ');
    svg('path', { class: 'area', d: `${d} L ${x(shown.at(-1).date)} ${y(0)} L ${x(shown[0].date)} ${y(0)} Z` }, chart);
    svg('path', { class: 'line', d }, chart);
    const last = shown.at(-1);
    svg('circle', { class: 'end-dot', cx: x(last.date), cy: y(last.value), r: 4.5 }, chart);
    svg('text', { class: 'end-label', x: x(last.date) + 9, y: y(last.value) - 8 }, chart).textContent = fmt(last.value, m.unit);
  }
  chart.setAttribute('aria-label', summary(m, shown));
  const wrap = h('div', { class: 'chart-wrap' }, chart);
  hover(wrap, chart, shown, x, y, m);
  return figure(w, 'line-widget', w.title ?? m.name, wrap, dataTable(shown, m.unit));
}

function bar(w, ctx) {
  const { m, series } = measureOf(w, ctx);
  if (!m || !series) return missing(w, 'measure');
  const { chart, x, y, months } = frame(ctx, m, series, 14);
  const shown = pointsUntil(series, ctx.asOf);
  const slot = (W - PAD.l - PAD.r - 28) / Math.max(1, months.length - 1);
  const bw = Math.min(24, slot - 2);
  for (const p of shown) {
    const cx = x(p.date);
    const top = y(p.value);
    const base = y(0);
    const r = Math.min(4, (base - top) / 2);
    svg('path', {
      class: 'column',
      d: `M ${cx - bw / 2} ${base} V ${top + r} Q ${cx - bw / 2} ${top} ${cx - bw / 2 + r} ${top} H ${cx + bw / 2 - r} Q ${cx + bw / 2} ${top} ${cx + bw / 2} ${top + r} V ${base} Z`,
    }, chart);
  }
  if (shown.length) {
    const last = shown.at(-1);
    svg('text', { class: 'end-label', x: x(last.date), y: y(last.value) - 6, 'text-anchor': 'middle' }, chart).textContent = fmt(last.value, m.unit);
  }
  chart.setAttribute('aria-label', summary(m, shown));
  const wrap = h('div', { class: 'chart-wrap' }, chart);
  hover(wrap, chart, shown, x, y, m);
  return figure(w, 'bar-widget', w.title ?? m.name, wrap, dataTable(shown, m.unit));
}

/** Crosshair and tooltip that follow the nearest month. */
function hover(wrap, chart, points, x, y, m) {
  if (!points.length) return;
  const cross = svg('line', { class: 'crosshair', y1: PAD.t, y2: H - PAD.b, visibility: 'hidden' }, chart);
  const dot = svg('circle', { class: 'hover-dot', r: 5, visibility: 'hidden' }, chart);
  const tip = h('div', { class: 'tooltip', hidden: true, role: 'status' });
  wrap.append(tip);
  const hit = svg('rect', { x: PAD.l - 10, y: 0, width: W - PAD.l - PAD.r + 20, height: H, fill: 'transparent' }, chart);
  hit.addEventListener('pointermove', (e) => {
    const box = chart.getBoundingClientRect();
    const vx = ((e.clientX - box.left) / box.width) * W;
    const p = points.reduce((best, q) => (Math.abs(x(q.date) - vx) < Math.abs(x(best.date) - vx) ? q : best), points[0]);
    for (const el of [cross, dot]) el.setAttribute('visibility', 'visible');
    cross.setAttribute('x1', x(p.date));
    cross.setAttribute('x2', x(p.date));
    dot.setAttribute('cx', x(p.date));
    dot.setAttribute('cy', y(p.value));
    tip.hidden = false;
    tip.textContent = `${monthLabel(p.date)}: ${fmt(p.value, m.unit)} ${unitText(m.unit)}`;
    tip.style.left = `${(x(p.date) / W) * 100}%`;
    tip.style.top = `${(y(p.value) / H) * 100}%`;
  });
  hit.addEventListener('pointerleave', () => {
    for (const el of [cross, dot]) el.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
}

function summary(m, shown) {
  if (!shown.length) return `${m.name}: no data yet`;
  const a = shown[0];
  const b = shown.at(-1);
  return `${m.name}: from ${fmt(a.value, m.unit)} in ${monthLabel(a.date)} to ${fmt(b.value, m.unit)} in ${monthLabel(b.date)}${m.target ? `, target ${fmt(+m.target, m.unit)}` : ''}.`;
}

function niceMax(v) {
  if (!v) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((k) => k * p).find((k) => k >= v * 1.05) ?? v;
}
const ticks = (top) => [0, 0.25, 0.5, 0.75, 1].map((k) => +(top * k).toPrecision(3));

// ---------------------------------------------------------------- progress
function progress(w, ctx) {
  const node = ctx.strategy.nodes[w.nodeId];
  if (!node) return missing(w, 'strategy item');
  const tasks = descendants(ctx.strategy, node.id).filter((n) => n.type === 'task');
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s.id, 0]));
  // Status at the end of the player's month; with no player, as things stand today.
  const dated = /^\d{4}-\d\d-\d\d$/.test(ctx.asOf);
  for (const t of tasks) counts[statusAt(t, dated ? addDays(ctx.asOf, 30) : '9999-12-31')]++;
  const total = tasks.length || 1;
  const bar = h('div', { class: 'stack', role: 'img', 'aria-label': TASK_STATUSES.map((s) => `${counts[s.id]} ${s.label.toLowerCase()}`).join(', ') },
    TASK_STATUSES.filter((s) => counts[s.id]).map((s) =>
      h('div', { class: 'stack-seg', style: `flex:${counts[s.id] / total};background:${s.color}`, title: `${s.label}: ${counts[s.id]}` })));
  return figure(w, 'progress-widget', w.title ?? `Work on ${node.title}`,
    h('div', {},
      bar,
      h('ul', { class: 'legend' }, TASK_STATUSES.map((s) =>
        h('li', {}, h('span', { class: 'swatch', style: `background:${s.color}` }), `${s.label} `, h('strong', {}, String(counts[s.id]))))),
      h('p', { class: 'kpi-meta' }, `${tasks.length} tasks under “${node.title}”${dated ? `, as of ${monthLabel(ctx.asOf)}` : ''}.`)));
}

// ---------------------------------------------------------------- text
function text(w) {
  return h('figure', { class: `widget text-widget size-${w.size ?? 'wide'}` },
    w.title && h('h3', {}, w.title),
    h('p', {}, w.text ?? ''));
}

const RENDERERS = { kpi, line, bar, progress, text };

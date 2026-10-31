import { h } from '../ui/dom.js';
import { col } from '../core/collections.js';
import { measureIndex } from '../platform/strategy.js';
import { monthLabel } from '../strategy/dates.js';
import { renderWidget } from '../charts/widgets.js';
import { DataGrid } from './DataGrid.js';
import { ChartDesigner } from './ChartDesigner.js';

/**
 * Program data mini-tool: the monthly values behind each measure. Later
 * these come from program systems; for now staff type or paste them in, and
 * dashboards and public sites update as they do. Three views:
 *   Spreadsheet     every measure and month, Excel-style, with calculated measures
 *   Chart designer  make a chart for a dashboard, a report or a post
 *   One measure     a single measure's chart and months
 */
const VIEWS = [
  { id: 'grid', label: 'Spreadsheet', render: DataGrid },
  { id: 'design', label: 'Chart designer', render: ChartDesigner },
  { id: 'one', label: 'One measure', render: OneMeasure },
];

export function DataTool(ctx) {
  const view = VIEWS.find((v) => v.id === ctx.dataView) ?? VIEWS[0];
  return h('div', { class: 'data-tool' },
    h('div', { class: 'data-title' },
      h('div', {},
        h('h1', {}, 'Program data'),
        h('p', { class: 'lede' }, 'Monthly values for every measure in your strategy. Change a number and every dashboard and public site using it updates.')),
      h('div', { role: 'tablist', class: 'seg' }, VIEWS.map((v) =>
        h('button', { role: 'tab', class: v === view ? 'on' : '', 'aria-selected': String(v === view), onclick: () => { ctx.dataView = v.id; ctx.render(); } }, v.label)))),
    view.render(ctx));
}

function OneMeasure(ctx) {
  const { data } = ctx;
  const measures = Object.values(measureIndex(ctx.strategy));
  if (!measures.length) return h('p', { class: 'empty' }, 'Add measures to objectives or goals in Strategy & Work first.');
  ctx.measureId = measures.some((m) => m.id === ctx.measureId) ? ctx.measureId : measures[0].id;
  const m = measures.find((x) => x.id === ctx.measureId);
  const series = data.doc.series[m.id] ?? { id: m.id, points: [] };
  const save = (points) =>
    data.apply(data.doc.series[m.id] ? col.update('series', m.id, { points }) : col.add('series', { id: m.id, points }));

  const nextMonth = () => {
    const last = series.points.at(-1)?.date ?? new Date().toISOString().slice(0, 8) + '01';
    let [y, mo] = [+last.slice(0, 4), +last.slice(5, 7) + (series.points.length ? 1 : 0)];
    if (mo > 12) { mo = 1; y++; }
    return `${y}-${String(mo).padStart(2, '0')}-01`;
  };

  return h('div', {},
    h('div', { class: 'data-head' },
      h('label', {}, 'Measure ',
        h('select', { name: 'measure', onchange: (e) => { ctx.measureId = e.target.value; ctx.render(); } },
          measures.map((x) => h('option', { value: x.id, selected: x.id === m.id }, `${x.name} (${x.nodeTitle})`)))),
      h('span', { class: 'muted' }, `Target ${m.target || '—'} ${m.unit ?? ''}`)),
    h('div', { class: 'widget-grid' },
      renderWidget({ id: 'data-preview', type: 'line', size: 'full', measureId: m.id }, { strategy: ctx.strategy, data: data.doc, asOf: '9999', months: [] })),
    h('table', { class: 'list compact data-table', style: 'margin-top:14px;max-width:420px' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Month'), h('th', {}, `Value (${m.unit || 'number'})`), h('th', {}))),
      h('tbody', {}, [...series.points].reverse().map((p) =>
        h('tr', {},
          h('td', {}, monthLabel(p.date)),
          h('td', {}, h('input', { type: 'number', step: 'any', name: `v-${p.date}`, value: p.value, 'aria-label': `${m.name}, ${monthLabel(p.date)}`,
            onchange: (e) => save(series.points.map((q) => (q.date === p.date ? { ...q, value: +e.target.value } : q))) })),
          h('td', {}, h('button', { class: 'icon-button', title: 'Remove month', 'aria-label': `Remove ${monthLabel(p.date)}`,
            onclick: () => save(series.points.filter((q) => q.date !== p.date)) }, '×')))))),
    h('div', { class: 'inline-form' },
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => save([...series.points, { date: nextMonth(), value: series.points.at(-1)?.value ?? 0 }]) }, `Add ${monthLabel(nextMonth())}`)));
}

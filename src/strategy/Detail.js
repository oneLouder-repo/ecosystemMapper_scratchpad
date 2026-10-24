import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { NODE_TYPES, TASK_STATUSES, ancestors, dateSpan, strategyOps, taskSummary } from '../platform/strategy.js';
import { staffList, teamList } from '../platform/org.js';
import { range, today } from './dates.js';
import { Gantt } from './Gantt.js';
import { Timeline } from './Timeline.js';
import { AssetsPanel } from './Assets.js';
import { loadDashboards, saveDoc } from '../platform/docs.js';
import { dashboardFromNode } from '../platform/dashboards.js';
import { uid } from '../core/ops.js';

/** The selected node: its fields, its people, and its Gantt chart or timeline. */
export function Detail(ctx) {
  const { store, org, select } = ctx;
  const doc = store.doc;
  const n = doc.nodes[ctx.selectedId];
  if (!n) return h('p', { class: 'muted' }, 'Choose something on the left.');
  const type = NODE_TYPES[n.type];
  const update = (patch) => store.apply(strategyOps.update(n.id, patch));

  const field = (label, control, wide) => h('label', { class: `field${wide ? ' wide' : ''}` }, h('span', {}, label), control);
  const text = (key, label, opts = {}) =>
    field(label, h(opts.area ? 'textarea' : 'input', { name: key, value: n[key] ?? '', rows: opts.rows ?? 3, placeholder: opts.placeholder ?? '',
      onchange: (e) => update({ [key]: e.target.value }) }), opts.wide);
  const date = (key, label) => field(label, h('input', { type: 'date', name: key, value: n[key] ?? '', onchange: (e) => update({ [key]: e.target.value || null }) }));

  const people = (key, list, label) =>
    field(label, h('div', { class: 'chips' },
      list.map((p) =>
        h('label', { class: 'chip' },
          h('input', { type: 'checkbox', checked: n[key].includes(p.id), onchange: (e) =>
            update({ [key]: e.target.checked ? [...n[key], p.id] : n[key].filter((id) => id !== p.id) }) }),
          p.color && h('span', { class: 'swatch', style: `background:${p.color}` }),
          p.name))), true);

  const measures = () =>
    field('Measures (feed dashboards in the Creative Palette)', h('div', { class: 'measures' },
      n.measures.map((m, i) =>
        h('div', { class: 'measure' },
          ['name', 'target', 'unit'].map((k) =>
            h('input', { value: m[k] ?? '', placeholder: k === 'name' ? 'Measure' : k[0].toUpperCase() + k.slice(1), class: `m-${k}`,
              onchange: (e) => update({ measures: n.measures.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) }) })),
          h('button', { class: 'icon-button', title: 'Remove measure', onclick: () => update({ measures: n.measures.filter((_, j) => j !== i) }) }, '×'))),
      h('button', { class: 'secondary', onclick: () => update({ measures: [...n.measures, { name: '', target: '', unit: '' }] }) }, 'Add measure')), true);

  const fields = {
    framework: () => [text('mission', 'Mission', { area: true, wide: true, rows: 2 }), text('vision', 'Vision', { area: true, wide: true, rows: 2 }), text('values', 'Values', { wide: true })],
    plan: () => [date('start', 'Starts'), date('end', 'Ends'), text('theme', 'Theme', { placeholder: 'e.g. Foundations' })],
    objective: () => [measures()],
    goal: () => [measures()],
    workplan: () => [date('start', 'Starts'), date('end', 'Ends'), people('teamIds', teamList(org), 'Teams'), people('staffIds', staffList(org), 'Staff')],
    task: () => [
      date('start', 'Starts'),
      date('end', 'Ends'),
      field('Status', h('select', { name: 'status', onchange: (e) => store.apply(strategyOps.setStatus(doc, n.id, e.target.value, today())) },
        options(TASK_STATUSES.map((s) => ({ id: s.id, label: s.label })), n.status))),
      people('assigneeIds', staffList(org), 'Assigned to'),
    ],
  }[n.type];

  const summary = () => {
    if (n.type === 'task') return null;
    const s = taskSummary(doc, n.id);
    const span = dateSpan(doc, n.id);
    return h('p', { class: 'summary' },
      span ? `${range(span.start, span.end)} · ` : '',
      `${s.total} tasks: ${s.done} done, ${s.active} in progress, ${s.blocked} blocked, ${s.planned} planned`);
  };

  const showsGantt = ['plan', 'objective', 'goal', 'workplan'].includes(n.type);

  return h('div', { class: 'detail' },
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
      ancestors(doc, n.id).map((a) => [h('button', { onclick: () => select(a.id) }, a.title), h('span', {}, '/')])),
    h('div', { class: 'detail-head' },
      h('span', { class: 'type-tag' }, type.glyph, ' ', type.label),
      h('input', { class: 'title-input detail-title', name: 'title', value: n.title, 'aria-label': 'Title', onchange: (e) => update({ title: e.target.value }) }),
    ),
    summary(),
    h('div', { class: 'fields' }, fields(), text('notes', 'Notes', { area: true, wide: true, rows: 3 })),
    h('div', { class: 'detail-actions' },
      type.children.map((c) => h('button', { class: 'secondary', onclick: () => ctx.addChild(n.id, c) }, `Add ${NODE_TYPES[c].label.toLowerCase()}`)),
      n.parentId && h('button', { class: 'secondary danger', onclick: () => {
        if (confirm(`Delete “${n.title}” and everything under it? You can undo.`)) {
          select(n.parentId);
          store.apply(strategyOps.removeNode(doc, n.id));
        }
      } }, icon('trash', 16), 'Delete'),
    ),
    showsGantt && h('section', { class: 'panel' }, h('h2', {}, n.type === 'workplan' ? 'Schedule' : 'Workplans under this'), Gantt(ctx, n.id)),
    n.type === 'task' && h('section', { class: 'panel' }, h('h2', {}, 'Lifetime'), Timeline(ctx, n)),
    (n.type === 'objective' || n.type === 'goal') && DashboardsPanel(ctx, n),
    n.type !== 'framework' && AssetsPanel(ctx, n),
  );
}

/** Dashboards made from this objective or goal, and a button to make one. */
function DashboardsPanel(ctx, n) {
  const doc = loadDashboards();
  const made = Object.values(doc.dashboards).filter((d) => d.sourceNodeId === n.id);
  const create = () => {
    const id = uid('dashboard');
    doc.dashboards[id] = { ...dashboardFromNode(ctx.store.doc, n.id), id };
    saveDoc('dashboards', doc);
    saveDoc('strategy', ctx.store.doc);
    location.href = `palette.html#${id}`;
  };
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', {}, 'Dashboards'),
      h('button', { onclick: create }, icon('chart', 16), 'Create dashboard')),
    h('p', { class: 'muted' }, n.measures.length
      ? `Makes an accessible dashboard from the ${n.measures.length} measure${n.measures.length > 1 ? 's' : ''} here and below, fed by live program data. You can edit it and publish it to a public site.`
      : 'Add a measure above to put numbers on the dashboard. It will still show the progress of the work.'),
    made.length > 0 && h('ul', { class: 'asset-list' }, made.map((d) =>
      h('li', { class: 'asset' },
        icon('chart', 18),
        h('div', { class: 'asset-text' }, h('a', { href: `palette.html#${d.id}` }, d.title), h('small', {}, `${d.widgets.length} widgets`)),
        h('span', { class: `badge ${d.visibility}` }, d.visibility),
        d.siteId && h('a', { href: `site.html?site=${d.siteId}#${d.id}`, target: '_blank' }, 'View on site ↗')))));
}

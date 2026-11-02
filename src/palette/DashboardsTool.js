import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { measureIndex, NODE_TYPES } from '../platform/strategy.js';
import { WIDGET_TYPES, widget } from '../platform/dashboards.js';
import { DashboardView } from '../charts/DashboardView.js';
import { calcMeasure } from '../platform/data.js';
import { SERIES_MAX } from '../charts/widgets.js';
import { applyTheme } from '../platform/themes.js';

/** Dashboards mini-tool: a gallery of dashboards, or the designer for one (#<id>). */
export function DashboardsTool(ctx) {
  const dash = ctx.dashboards.doc.dashboards[ctx.route];
  return dash ? Editor(ctx, dash) : Gallery(ctx);
}

const siteUrl = (dash) => `site.html?site=${dash.siteId}#${dash.id}`;
const sourceNodes = (strategy) =>
  Object.values(strategy.nodes).filter((n) => (n.type === 'objective' || n.type === 'goal') && n.measures?.length);

function Gallery(ctx) {
  const list = Object.values(ctx.dashboards.doc.dashboards);
  const from = h('select', { name: 'from-node', 'aria-label': 'Objective or goal' },
    sourceNodes(ctx.strategy).map((n) => h('option', { value: n.id }, `${NODE_TYPES[n.type].glyph} ${n.title}`)));
  return h('div', {},
    h('h1', {}, 'Dashboards'),
    h('p', { class: 'lede' }, 'Design dashboards from your strategy measures and program data. Keep them private for staff and the board, or publish them to a public site.'),
    h('div', { class: 'editor-bar' },
      h('label', {}, 'Start from', from),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => ctx.create(from.value) }, 'Create dashboard'),
      h('span', { class: 'muted' }, 'or'),
      h('button', { class: 'btn btn-sm', onclick: () => ctx.create() }, 'Blank dashboard')),
    list.length
      ? h('div', { class: 'cards' }, list.map((d) => {
          const site = ctx.org.sites[d.siteId];
          return h('a', { class: 'card', href: `#${d.id}` },
            h('h3', {}, icon('chart', 22), d.title),
            h('p', {}, d.description || 'No description yet.'),
            h('div', { class: 'stat-line' },
              h('span', { class: `badge ${d.visibility}` }, d.visibility), ' ',
              `${d.widgets.length} widgets`, site ? ` · on ${site.name}` : ''));
        }))
      : h('p', { class: 'empty' }, 'No dashboards yet. Create one from an objective or goal above.'));
}

/**
 * The dashboard designer: the dashboard as visitors will see it, in the
 * site's colours, edited in place. Click the title or description to type;
 * click a widget to choose what it shows; drag widgets to reorder them; add
 * widgets from the Add panel, straight from your measures.
 */
function Editor(ctx, dash) {
  const { dashboards, org } = ctx;
  ctx.selectedWidget = dash.widgets.some((w) => w.id === ctx.selectedWidget) ? ctx.selectedWidget : null;
  const update = (patch) => dashboards.apply(col.update('dashboards', dash.id, patch));
  const setWidget = (id, patch) => update({ widgets: dash.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const select = (id) => { ctx.selectedWidget = id; ctx.render(); };
  const add = (w) => { update({ widgets: [...dash.widgets, w] }); select(w.id); };
  // Strategy measures, then calculated ones (Program data).
  const measures = [...Object.values(measureIndex(ctx.strategy)), ...Object.values(ctx.data.doc.calcs ?? {}).map(calcMeasure)];
  const nodes = Object.values(ctx.strategy.nodes).filter((n) => ['plan', 'objective', 'goal', 'workplan'].includes(n.type));
  const sites = Object.values(org.sites);
  const site = org.sites[dash.siteId];
  const live = dash.visibility === 'public' && site && site.visibility !== 'private';

  // Editable in place: the title and description.
  const inline = (tag, cls, value, placeholder, onchange) => {
    const el = h(tag, { class: `dd-inline ${cls}`, contentEditable: 'plaintext-only', spellcheck: true, 'data-placeholder': placeholder, title: 'Click to edit' }, value ?? '');
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    el.addEventListener('blur', () => { const v = el.textContent.trim(); if (v !== (value ?? '')) onchange(v); });
    return el;
  };

  // Each widget: click to select, drag to reorder, a small bar of quick actions.
  let dragId = null;
  const decorate = (w, el) => {
    const i = dash.widgets.indexOf(w);
    el.classList.add('dd-widget');
    el.classList.toggle('dd-selected', w.id === ctx.selectedWidget);
    el.draggable = true;
    el.tabIndex = 0;
    el.addEventListener('click', (e) => { if (!e.target.closest('.dd-bar, a, button')) select(w.id); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === el) select(w.id); });
    el.addEventListener('dragstart', (e) => { dragId = w.id; e.dataTransfer.effectAllowed = 'move'; el.classList.add('dd-dragging'); });
    el.addEventListener('dragend', () => { dragId = null; el.classList.remove('dd-dragging'); });
    el.addEventListener('dragover', (e) => { if (dragId && dragId !== w.id) { e.preventDefault(); el.classList.add('dd-drop'); } });
    el.addEventListener('dragleave', () => el.classList.remove('dd-drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('dd-drop');
      if (!dragId || dragId === w.id) return;
      const widgets = dash.widgets.filter((x) => x.id !== dragId);
      widgets.splice(widgets.findIndex((x) => x.id === w.id), 0, dash.widgets.find((x) => x.id === dragId));
      update({ widgets });
    });
    const sizes = ['small', 'wide', 'full'];
    el.append(h('div', { class: 'dd-bar' },
      h('span', { class: 'dd-grip', title: 'Drag to move', 'aria-hidden': 'true' }, '⋮⋮'),
      h('button', { type: 'button', title: 'Change what it shows', onclick: () => select(w.id) }, icon('settings', 14)),
      h('button', { type: 'button', title: `Size: ${w.size ?? 'wide'} (click for the next size)`, onclick: () => setWidget(w.id, { size: sizes[(sizes.indexOf(w.size ?? 'wide') + 1) % 3] }) }, '⇔'),
      h('button', { type: 'button', title: 'Move earlier', disabled: i === 0, onclick: () => { const ws = [...dash.widgets]; ws.splice(i - 1, 0, ws.splice(i, 1)[0]); update({ widgets: ws }); } }, '←'),
      h('button', { type: 'button', title: 'Move later', disabled: i === dash.widgets.length - 1, onclick: () => { const ws = [...dash.widgets]; ws.splice(i + 1, 0, ws.splice(i, 1)[0]); update({ widgets: ws }); } }, '→'),
      h('button', { type: 'button', title: 'Remove', class: 'dd-del', onclick: () => update({ widgets: dash.widgets.filter((x) => x.id !== w.id) }) }, '×')));
    return el;
  };

  const preview = DashboardView({ ...dash, title: '', description: '' }, { strategy: ctx.strategy, data: ctx.data.doc }, { decorate });
  preview.querySelector('.dashboard-head')?.remove();
  const canvas = h('div', { class: 'dd-canvas site-page' },
    h('div', { class: 'dd-site-bar', 'aria-hidden': 'true' }, h('span', { class: 'dd-dot' }), h('span', { class: 'dd-dot' }), h('span', { class: 'dd-dot' }),
      h('span', { class: 'dd-url' }, site ? `${site.url ?? site.name}` : 'Not on a site yet')),
    h('div', { class: 'dd-page' },
      h('header', { class: 'dashboard-head dd-head' },
        inline('h2', 'dd-title', dash.title, 'Name this dashboard', (v) => update({ title: v || 'Untitled dashboard' })),
        inline('p', 'dd-desc', dash.description, 'Add a sentence about what this shows and why it matters', (v) => update({ description: v }))),
      dash.widgets.length ? preview : h('div', { class: 'dd-empty' }, h('p', {}, 'This dashboard is empty.'), h('p', { class: 'muted' }, 'Add numbers and charts from the panel on the right: pick a measure and how to show it.'))));
  applyTheme(canvas, org.theme);
  canvas.addEventListener('click', (e) => { if (e.target === canvas || e.target.classList.contains('dd-page')) select(null); });

  return h('div', { class: 'dd' },
    h('div', { class: 'dd-top' },
      h('a', { class: 'btn btn-sm btn-ghost', href: '#dashboards' }, '← All dashboards'),
      h('span', { class: `dd-status ${live ? 'on' : ''}` }, live ? `Public on ${site.name}` : dash.visibility === 'public' ? 'Public, but not on a public site' : 'Private: staff and board only'),
      h('span', { class: 'spacer' }),
      h('label', { class: 'dd-field' }, 'Site', h('select', { class: 'select select-sm', name: 'siteId', onchange: (e) => update({ siteId: e.target.value || null }) },
        h('option', { value: '' }, 'No site'), options(sites.map((s) => ({ id: s.id, label: `${s.name}${s.visibility === 'private' ? ' (private)' : ''}` })), dash.siteId))),
      dash.visibility === 'public'
        ? h('button', { class: 'btn btn-sm', onclick: () => update({ visibility: 'private' }) }, 'Make private')
        : h('button', { class: 'btn btn-sm btn-primary', disabled: !site, title: site ? '' : 'Choose a site first', onclick: () => update({ visibility: 'public' }) }, 'Publish'),
      site && h('a', { href: siteUrl(dash), target: '_blank', class: 'btn btn-sm btn-ghost' }, 'View ↗'),
      h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'Delete this dashboard', 'aria-label': 'Delete this dashboard', onclick: () => {
        if (!confirm(`Delete “${dash.title}”? You can undo.`)) return;
        ctx.go('dashboards');
        dashboards.apply(col.remove('dashboards', dash.id));
      } }, icon('trash', 16))),
    h('div', { class: 'dd-body' },
      canvas,
      h('aside', { class: 'dd-panel' }, ctx.selectedWidget
        ? WidgetPanel(ctx, dash.widgets.find((w) => w.id === ctx.selectedWidget), { measures, nodes, setWidget, close: () => select(null), remove: (id) => { update({ widgets: dash.widgets.filter((x) => x.id !== id) }); select(null); } })
        : AddPanel(ctx, dash, { measures, add }))));
}

/** Add widgets: straight from a measure, or by kind. */
function AddPanel(ctx, dash, { measures, add }) {
  const q = h('input', { class: 'input input-sm w-full', name: 'dd-search', placeholder: 'Find a measure', value: ctx.ddSearch ?? '' });
  const list = h('div', { class: 'dd-measures' });
  const draw = () => {
    ctx.ddSearch = q.value;
    const term = q.value.trim().toLowerCase();
    const shown = measures.filter((m) => !term || `${m.name} ${m.nodeTitle}`.toLowerCase().includes(term));
    const groups = {};
    for (const m of shown) (groups[m.nodeTitle] ??= []).push(m);
    const inUse = new Set(dash.widgets.flatMap((w) => [w.measureId, ...(w.measureIds ?? [])]).filter(Boolean));
    list.replaceChildren(...Object.entries(groups).map(([title, ms]) => h('div', { class: 'dd-group' },
      h('h4', {}, title),
      ms.map((m) => h('div', { class: `dd-measure${inUse.has(m.id) ? ' used' : ''}` },
        h('span', { class: 'dd-measure-name', title: inUse.has(m.id) ? 'Already on this dashboard' : '' }, m.name, inUse.has(m.id) && h('small', {}, ' ✓')),
        h('span', { class: 'dd-measure-add' },
          h('button', { type: 'button', title: 'Add as a headline number', onclick: () => add(widget('kpi', { measureId: m.id })) }, '123'),
          h('button', { type: 'button', title: 'Add as a line over time', onclick: () => add(widget('line', { measureId: m.id })) }, '⟋'),
          h('button', { type: 'button', title: 'Add as monthly columns', onclick: () => add(widget('bar', { measureId: m.id })) }, '▮▮')))))));
    if (!shown.length) list.replaceChildren(h('p', { class: 'muted small' }, measures.length ? 'No measures match.' : 'Add measures to objectives and goals in Strategy & Work.'));
  };
  q.addEventListener('input', draw);
  draw();
  return h('div', {},
    h('h3', {}, 'Add to the dashboard'),
    h('div', { class: 'dd-kinds' }, WIDGET_TYPES.map((t) => h('button', { type: 'button', class: 'dd-kind', onclick: () => {
      const first = { measure: { measureId: measures[0]?.id }, measures: { measureIds: measures.slice(0, 2).map((m) => m.id) }, node: { nodeId: dash.sourceNodeId ?? Object.values(ctx.strategy.nodes).find((n) => n.type === 'objective')?.id }, null: { title: 'Heading', text: 'Say what this shows and why it matters.' } };
      add(widget(t.id, first[t.needs]));
    } }, h('span', { class: `dd-kind-icon k-${t.id}`, 'aria-hidden': 'true' }), t.label))),
    h('h3', {}, 'From your measures'),
    h('p', { class: 'muted small' }, 'Add a measure as a number, a line or columns.'),
    q, list);
}

/** Settings for the selected widget. */
function WidgetPanel(ctx, w, { measures, nodes, setWidget, close, remove }) {
  const type = WIDGET_TYPES.find((t) => t.id === w.type);
  const field = (label, control) => h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, label), control);
  const groups = {};
  for (const m of measures) (groups[m.nodeTitle] ??= []).push(m);
  const measureSelect = (value, onchange, name) => h('select', { class: 'select select-sm w-full', name, onchange },
    !value && h('option', { value: '' }, 'Choose a measure…'),
    Object.entries(groups).map(([title, ms]) => h('optgroup', { label: title }, options(ms.map((m) => ({ id: m.id, label: m.name })), value))));
  const on = new Set(w.measureIds ?? []);
  return h('div', {},
    h('div', { class: 'dd-panel-head' }, h('h3', {}, type?.label ?? w.type), h('button', { class: 'btn btn-xs btn-ghost', onclick: close }, 'Done')),
    field('Show it as', h('select', { class: 'select select-sm w-full', name: 'dd-type', onchange: (e) => {
      const next = WIDGET_TYPES.find((t) => t.id === e.target.value);
      const patch = { type: next.id, size: next.size };
      if (next.needs === 'measures' && !w.measureIds) patch.measureIds = [w.measureId ?? measures[0]?.id].filter(Boolean);
      if (next.needs === 'measure' && !w.measureId) patch.measureId = w.measureIds?.[0] ?? measures[0]?.id;
      if (next.needs === 'node' && !w.nodeId) patch.nodeId = nodes[0]?.id;
      setWidget(w.id, patch);
    } }, options(WIDGET_TYPES.map((t) => ({ id: t.id, label: t.label })), w.type))),
    type?.needs === 'measure' && field('Measure', measureSelect(w.measureId, (e) => setWidget(w.id, { measureId: e.target.value }), 'dd-measure')),
    type?.needs === 'measures' && h('fieldset', { class: 'fieldset' }, h('legend', { class: 'fieldset-legend' }, `Measures to compare (up to ${SERIES_MAX})`),
      h('div', { class: 'dd-checks' }, measures.map((m) => h('label', {},
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: on.has(m.id), disabled: !on.has(m.id) && on.size >= SERIES_MAX,
          onchange: (e) => setWidget(w.id, { measureIds: e.target.checked ? [...on, m.id] : [...on].filter((id) => id !== m.id) }) }), m.name)))),
    type?.needs === 'node' && field('Work under', h('select', { class: 'select select-sm w-full', name: 'dd-node', onchange: (e) => setWidget(w.id, { nodeId: e.target.value }) },
      nodes.map((n) => h('option', { value: n.id, selected: n.id === w.nodeId }, `${NODE_TYPES[n.type].glyph} ${n.title}`)))),
    field('Title (leave empty for the measure’s name)', h('input', { class: 'input input-sm w-full', name: 'dd-title', value: w.title ?? '', onchange: (e) => setWidget(w.id, { title: e.target.value || undefined }) })),
    w.type === 'text' && field('Text', h('textarea', { class: 'textarea textarea-sm w-full', rows: 4, name: 'dd-text', onchange: (e) => setWidget(w.id, { text: e.target.value }) }, w.text ?? '')),
    field('Size', h('div', { class: 'join' }, [['small', 'Small'], ['wide', 'Wide'], ['full', 'Full width']].map(([id, label]) =>
      h('button', { type: 'button', class: `btn btn-sm join-item${(w.size ?? 'wide') === id ? ' btn-active' : ''}`, onclick: () => setWidget(w.id, { size: id }) }, label)))),
    h('button', { class: 'btn btn-sm btn-ghost text-error', onclick: () => remove(w.id) }, icon('trash', 14), 'Remove this widget'));
}

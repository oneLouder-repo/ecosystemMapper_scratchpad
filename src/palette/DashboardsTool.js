import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { measureIndex, NODE_TYPES } from '../platform/strategy.js';
import { WIDGET_TYPES, widget } from '../platform/dashboards.js';
import { DashboardView } from '../charts/DashboardView.js';

/** Dashboards mini-tool: a gallery of dashboards, or the editor for one (#<id>). */
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
      h('button', { onclick: () => ctx.create(from.value) }, 'Create dashboard'),
      h('span', { class: 'muted' }, 'or'),
      h('button', { class: 'secondary', onclick: () => ctx.create() }, 'Blank dashboard')),
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

function Editor(ctx, dash) {
  const { dashboards, org } = ctx;
  const update = (patch) => dashboards.apply(col.update('dashboards', dash.id, patch));
  const setWidget = (id, patch) => update({ widgets: dash.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  const move = (i, by) => {
    const widgets = [...dash.widgets];
    const [w] = widgets.splice(i, 1);
    widgets.splice(Math.max(0, Math.min(widgets.length, i + by)), 0, w);
    update({ widgets });
  };
  const measures = Object.values(measureIndex(ctx.strategy));
  const nodes = Object.values(ctx.strategy.nodes).filter((n) => ['plan', 'objective', 'goal', 'workplan'].includes(n.type));
  const sites = Object.values(org.sites);
  const site = org.sites[dash.siteId];

  const measureSelect = (w) => {
    const groups = Object.groupBy ? Object.groupBy(measures, (m) => m.nodeTitle) : measures.reduce((g, m) => ((g[m.nodeTitle] ??= []).push(m), g), {});
    return h('select', { name: `${w.id}-measure`, 'aria-label': 'Measure', onchange: (e) => setWidget(w.id, { measureId: e.target.value }) },
      !w.measureId && h('option', { value: '' }, 'Choose a measure…'),
      Object.entries(groups).map(([title, ms]) => h('optgroup', { label: title }, options(ms.map((m) => ({ id: m.id, label: m.name })), w.measureId))));
  };

  // Edit controls added under each widget in the live preview.
  const decorate = (w, el) => {
    const i = dash.widgets.indexOf(w);
    const type = WIDGET_TYPES.find((t) => t.id === w.type);
    el.classList.add('decorated');
    el.append(h('div', { class: 'widget-tools' },
      h('strong', {}, type?.label ?? w.type),
      type?.needs === 'measure' && measureSelect(w),
      type?.needs === 'node' && h('select', { name: `${w.id}-node`, 'aria-label': 'Strategy item', onchange: (e) => setWidget(w.id, { nodeId: e.target.value }) },
        nodes.map((n) => h('option', { value: n.id, selected: n.id === w.nodeId }, `${NODE_TYPES[n.type].glyph} ${n.title}`))),
      h('input', { name: `${w.id}-title`, value: w.title ?? '', placeholder: 'Title', 'aria-label': 'Widget title', onchange: (e) => setWidget(w.id, { title: e.target.value || undefined }) }),
      w.type === 'text' && h('input', { name: `${w.id}-text`, value: w.text ?? '', placeholder: 'Text', 'aria-label': 'Widget text', onchange: (e) => setWidget(w.id, { text: e.target.value }) }),
      h('select', { name: `${w.id}-size`, 'aria-label': 'Size', onchange: (e) => setWidget(w.id, { size: e.target.value }) },
        options([{ id: 'small', label: 'Small' }, { id: 'wide', label: 'Wide' }, { id: 'full', label: 'Full width' }], w.size)),
      h('button', { class: 'secondary', title: 'Move earlier', 'aria-label': 'Move earlier', disabled: i === 0, onclick: () => move(i, -1) }, '←'),
      h('button', { class: 'secondary', title: 'Move later', 'aria-label': 'Move later', disabled: i === dash.widgets.length - 1, onclick: () => move(i, 1) }, '→'),
      h('button', { class: 'secondary danger', title: 'Remove widget', 'aria-label': 'Remove widget', onclick: () => update({ widgets: dash.widgets.filter((x) => x.id !== w.id) }) }, '×')));
    return el;
  };

  const addType = h('select', { name: 'add-type', 'aria-label': 'Widget type' }, options(WIDGET_TYPES.map((t) => ({ id: t.id, label: t.label }))));
  const preview = DashboardView({ ...dash, title: dash.title }, { strategy: ctx.strategy, data: ctx.data.doc }, { decorate, asOf: ctx.asOf[dash.id] });
  // Remember where the player is, so edits don't jump back to the latest month.
  new MutationObserver(() => { ctx.asOf[dash.id] = preview.dataset.asOf; }).observe(preview, { attributes: true, attributeFilter: ['data-as-of'] });

  return h('div', {},
    h('div', { class: 'editor-bar' },
      h('label', { class: 'grow' }, 'Title', h('input', { name: 'title', value: dash.title, onchange: (e) => update({ title: e.target.value }) })),
      h('label', {}, 'Visibility',
        h('select', { name: 'visibility', onchange: (e) => update({ visibility: e.target.value }) },
          options([{ id: 'private', label: 'Private (staff)' }, { id: 'public', label: 'Public' }], dash.visibility))),
      h('label', {}, 'Site',
        h('select', { name: 'siteId', onchange: (e) => update({ siteId: e.target.value || null }) },
          h('option', { value: '' }, 'No site'),
          options(sites.map((s) => ({ id: s.id, label: `${s.name} (${s.visibility})` })), dash.siteId))),
      site && h('a', { href: siteUrl(dash), target: '_blank', class: 'secondary' }, dash.visibility === 'public' ? 'View on site ↗' : 'Preview on site ↗'),
      h('button', { class: 'secondary danger', onclick: () => {
        if (!confirm(`Delete “${dash.title}”? You can undo.`)) return;
        ctx.go('dashboards');
        dashboards.apply(col.remove('dashboards', dash.id));
      } }, icon('trash', 16), 'Delete')),
    h('div', { class: 'editor-bar' },
      h('label', { class: 'grow' }, 'Description', h('input', { name: 'description', value: dash.description ?? '', onchange: (e) => update({ description: e.target.value }) })),
      dash.sourceNodeId && ctx.strategy.nodes[dash.sourceNodeId] &&
        h('a', { href: `strategy.html#${dash.sourceNodeId}` }, `Made from: ${ctx.strategy.nodes[dash.sourceNodeId].title}`)),
    dash.visibility === 'public' && !site && h('p', { class: 'note' }, 'This dashboard is public but not on a site yet. Choose a site to publish it.'),
    dash.visibility === 'public' && site?.visibility === 'private' && h('p', { class: 'note' }, `${site.name} is private, so only signed-in people will see this.`),
    preview,
    h('div', { class: 'add-widget' },
      addType,
      h('button', { onclick: () => {
        const type = addType.value;
        const first = { measure: { measureId: measures[0]?.id }, node: { nodeId: dash.sourceNodeId ?? nodes[0]?.id }, null: { title: 'Heading', text: 'Say what this shows and why it matters.' } };
        update({ widgets: [...dash.widgets, widget(type, first[WIDGET_TYPES.find((t) => t.id === type).needs])] });
      } }, icon('plus', 16), 'Add widget'),
      h('span', { class: 'muted' }, 'Charts read live program data. Press Play to watch the year unfold.')));
}

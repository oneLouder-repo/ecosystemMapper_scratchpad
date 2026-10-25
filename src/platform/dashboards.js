import { uid } from '../core/ops.js';
import { measuresUnder, rootOf, childrenOf, descendants } from './strategy.js';
import { dataMonths } from './data.js';

/**
 * Dashboards, made in the Workbench and published to sites.
 * { id, dashboards: { [id]: Dashboard } }
 *
 * Dashboard {
 *   title, description,
 *   visibility: 'private' | 'public',   public ones show on their site
 *   siteId,                             which org site publishes it
 *   sourceNodeId,                       the objective or goal it was made from, if any
 *   createdBy,                          staff id of whoever made it
 *   widgets: [Widget],
 * }
 * Widget { id, type, size: 'small' | 'wide', title?, text?, measureId?, nodeId? }
 *   kpi       latest value of a measure against its target
 *   line      a measure over time, with its target
 *   bar       a measure month by month
 *   progress  task status under a strategy node
 *   text      a heading and paragraph
 * Add a widget type in charts/widgets.js and list it in WIDGET_TYPES.
 */
export const WIDGET_TYPES = [
  { id: 'kpi', label: 'Headline number', needs: 'measure', size: 'small' },
  { id: 'line', label: 'Line over time', needs: 'measure', size: 'wide' },
  { id: 'bar', label: 'Monthly columns', needs: 'measure', size: 'wide' },
  { id: 'progress', label: 'Work progress', needs: 'node', size: 'wide' },
  { id: 'text', label: 'Text', needs: null, size: 'wide' },
];

export const widget = (type, more = {}) => ({
  id: uid('w'),
  type,
  size: WIDGET_TYPES.find((t) => t.id === type)?.size ?? 'wide',
  ...more,
});

/**
 * Build a dashboard for a strategic objective or goal: an introduction,
 * then a headline number and a line chart for every measure on it and
 * beneath it, then the progress of the work that serves it.
 */
export function dashboardFromNode(strategy, nodeId, createdBy = null) {
  const node = strategy.nodes[nodeId];
  const measures = measuresUnder(strategy, nodeId);
  const goals = childrenOf(strategy, nodeId).filter((n) => n.type === 'goal').map((g) => g.title);
  const intro = node.notes || (goals.length ? `How we are doing on ${goals.length === 1 ? 'our goal' : `${goals.length} goals`}: ${goals.join('; ')}.` : `Progress on ${node.title.toLowerCase()}.`);
  return {
    title: node.title,
    description: `Live from our program data. Part of ${rootOf(strategy)?.title ?? 'our strategy'}.`,
    visibility: 'private',
    siteId: null,
    sourceNodeId: nodeId,
    createdBy,
    widgets: [
      widget('text', { title: node.title, text: intro }),
      ...measures.map((m) => widget('kpi', { measureId: m.id })),
      ...measures.map((m) => widget('line', { measureId: m.id })),
      descendants(strategy, nodeId).some((n) => n.type === 'task') && widget('progress', { nodeId, title: 'The work behind it' }),
    ].filter(Boolean),
  };
}

/** The months a dashboard's player steps through. */
export function dashboardMonths(dash, data) {
  const ids = dash.widgets.map((w) => w.measureId).filter(Boolean);
  return dataMonths(data, ids.length ? ids : undefined);
}

/** Example dashboards: one public dashboard per example org. */
export function seedDashboards(strategy) {
  const examples = [
    { objectiveId: 'obj-equity', id: 'dash-equity', title: 'Reach and equity', siteId: 'site-impact', createdBy: 's-eval' },
    { objectiveId: 'obj-meals', id: 'dash-meals', title: 'Meals and good food boxes', siteId: 'site-main', createdBy: 'r-lead' },
  ];
  const dashboards = {};
  for (const ex of examples) {
    if (!strategy.nodes[ex.objectiveId]) continue;
    dashboards[ex.id] = { ...dashboardFromNode(strategy, ex.objectiveId, ex.createdBy), id: ex.id, title: ex.title, visibility: 'public', siteId: ex.siteId };
  }
  return { id: 'dashboards', dashboards };
}

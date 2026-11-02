import { h } from '../ui/dom.js';
import { dashboardMonths } from '../platform/dashboards.js';
import { renderWidget } from './widgets.js';

/**
 * A whole dashboard: title, description and the widget grid, as of the
 * latest month of data (the timeline player is set aside for now). Used by the Workbench (with `decorate` to add edit
 * controls to each widget) and by public sites.
 */
export function DashboardView(dash, docs, { decorate, asOf: start } = {}) {
  const months = dashboardMonths(dash, docs.data);
  const asOf = start && months.includes(start) ? start : months.at(-1);
  const grid = h('div', { class: 'widget-grid' });
  const draw = () => {
    grid.replaceChildren(...dash.widgets.map((w) => {
      const el = renderWidget(w, { strategy: docs.strategy, data: docs.data, asOf: asOf ?? '9999', months });
      return decorate ? decorate(w, el) : el;
    }));
  };
  draw();
  const view = h('section', { class: 'dashboard', 'aria-label': dash.title },
    h('header', { class: 'dashboard-head' }, h('h2', {}, dash.title), dash.description && h('p', {}, dash.description)),
    grid,
  );
  view.dataset.asOf = asOf ?? '';
  return view;
}

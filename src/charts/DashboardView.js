import { h } from '../ui/dom.js';
import { dashboardMonths } from '../platform/dashboards.js';
import { renderWidget } from './widgets.js';
import { Player } from './Player.js';

/**
 * A whole dashboard: title, description, the timeline player and the
 * widget grid. Used by the Creative Palette (with `decorate` to add edit
 * controls to each widget) and by public sites.
 */
export function DashboardView(dash, docs, { decorate, asOf: start } = {}) {
  const months = dashboardMonths(dash, docs.data);
  let asOf = start && months.includes(start) ? start : months.at(-1);
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
    months.length > 1 && Player({ months, value: asOf, onChange: (m) => { asOf = m; view.dataset.asOf = m; draw(); } }),
    grid,
  );
  view.dataset.asOf = asOf ?? '';
  return view;
}

import { h } from './dom.js';
import { ItemDetails } from './Inspector.js';

/**
 * A small bar at the bottom of the board saying what's selected, with
 * Details and Delete (and Group, for several actors). Hidden when nothing is.
 */
export function SelectionBar(host, ctx) {
  const { store, mapView } = ctx;
  const bar = h('div', { class: 'selection-bar', role: 'toolbar', 'aria-label': 'Selection' });
  host.append(bar);

  const kindLabel = (a) => (a.kind === 'agent' ? 'Agent' : 'Actor');
  function render() {
    const { actorIds, connectorIds, groupIds } = mapView.selectedItems();
    const count = actorIds.length + connectorIds.length + groupIds.length;
    bar.classList.toggle('show', count > 0);
    if (!count) return bar.replaceChildren();
    const map = store.map;
    let what;
    if (count > 1) what = `${count} selected`;
    else if (actorIds.length) { const a = map.actors[actorIds[0]]; what = [h('b', {}, a.label || 'Untitled'), ` · ${kindLabel(a)}`]; }
    else if (connectorIds.length) {
      const c = map.connectors[connectorIds[0]];
      const end = (d) => (d.actorId ? map.actors[d.actorId]?.label || 'Untitled' : 'floating end');
      what = [h('b', {}, c.label || 'Connector'), ` · ${end(c.from)} → ${end(c.to)}`];
    } else what = [h('b', {}, map.groups[groupIds[0]].label || 'Group'), ' · Group'];
    bar.replaceChildren(...[
      h('span', { class: 'selection-what' }, what),
      count > 1 && actorIds.length > 1 && h('button', { class: 'btn btn-xs', onclick: () => ctx.actions.groupSelection() }, 'Group'),
      h('button', { class: 'btn btn-xs btn-primary', title: 'Details (Enter, or double-click)', onclick: () => ItemDetails(ctx) }, 'Details'),
      h('button', { class: 'btn btn-xs btn-ghost', title: 'Delete (Delete key)', onclick: () => ctx.actions.deleteSelection() }, 'Delete')].filter(Boolean));
  }
  mapView.addEventListener('selection', render);
  store.addEventListener('change', render);
  render();
}

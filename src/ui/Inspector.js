import { h, options } from './dom.js';
import { columnAt, regionAt } from '../lenses/index.js';

/** Side panel for editing whatever is selected. */
export function Inspector(el, ctx) {
  const { store, ops, mapView } = ctx;

  const field = (label, control) => h('label', { class: 'field' }, h('span', {}, label), control);

  const layerSelect = (item, update) =>
    h('select', { onchange: (e) => store.apply(update(item.id, { layerId: e.target.value })) },
      options(store.map.layers.map((l) => ({ id: l.id, label: l.name })), item.layerId ?? store.map.layers[0]?.id));

  const categoryOptions = (lens, current) => {
    const list = lens.actorCategories.map((c) => ({ id: c.id, label: c.label }));
    if (!lens.categoryById[current]) list.push({ id: current, label: `Unmapped (${current})` });
    return options(list, current);
  };

  const typeOptions = (lens, current) => {
    const list = lens.connectorTypes.map((t) => ({ id: t.id, label: t.label }));
    if (!lens.typeById[current]) list.push({ id: current, label: `Unmapped (${current})` });
    return options(list, current);
  };

  const describeDock = (dock) =>
    dock.actorId ? store.map.actors[dock.actorId]?.label || 'Untitled actor' : 'Floating end';

  const segmented = (value, choices, onpick) =>
    h('div', { class: 'segmented', role: 'group' },
      choices.map(([id, label]) => h('button', {
        class: id === value ? 'on' : '',
        'aria-pressed': String(id === value),
        onclick: () => id !== value && onpick(id),
      }, label)));

  function renderActor(a) {
    const lens = mapView.lens;
    const region = regionAt(lens, a.place);
    const column = columnAt(lens, a.place);
    const kind = a.kind ?? 'actor';
    return [
      h('h2', {}, kind === 'agent' ? 'Agent' : 'Actor'),
      segmented(kind, [['actor', 'Actor'], ['agent', 'Agent']], (k) => store.apply(ops.updateActor(a.id, { kind: k }))),
      field('Name', h('input', { value: a.label, onchange: (e) => store.apply(ops.updateActor(a.id, { label: e.target.value })) })),
      field('Category', h('select', { onchange: (e) => store.apply(ops.updateActor(a.id, { category: e.target.value })) }, categoryOptions(lens, a.category))),
      field('Region', h('output', {}, [region?.label, column?.label].filter(Boolean).join(' · ') || 'Outside the lens')),
      field('Depth', h('output', { class: 'muted' }, `${Math.round(a.place.depth * 100)}% from surface (explicit) to deep (implicit)`)),
      field('Layer', layerSelect(a, ops.updateActor)),
      field('Notes', h('textarea', {
        rows: 5,
        value: a.meta?.notes ?? '',
        onchange: (e) => store.apply(ops.updateActor(a.id, { meta: { ...a.meta, notes: e.target.value } })),
      })),
    ];
  }

  function renderConnector(c) {
    const lens = mapView.lens;
    return [
      h('h2', {}, 'Connector'),
      h('p', { class: 'muted' }, `${describeDock(c.from)} → ${describeDock(c.to)}`),
      field('Label', h('input', { value: c.label, onchange: (e) => store.apply(ops.updateConnector(c.id, { label: e.target.value })) })),
      field('Type', h('select', { onchange: (e) => store.apply(ops.updateConnector(c.id, { type: e.target.value })) }, typeOptions(lens, c.type))),
      field('Layer', layerSelect(c, ops.updateConnector)),
      h('button', {
        class: 'secondary',
        onclick: () => store.apply(ops.batch([
          ops.dockConnector(c.id, 'from', c.to),
          ops.dockConnector(c.id, 'to', c.from),
        ])),
      }, 'Reverse direction'),
    ];
  }

  function renderGroup(g) {
    return [
      h('h2', {}, 'Group'),
      field('Name', h('input', { value: g.label, onchange: (e) => store.apply(ops.updateGroup(g.id, { label: e.target.value })) })),
      h('p', { class: 'muted' }, `${g.memberIds.length} members: ${g.memberIds.map((id) => store.map.actors[id]?.label || 'Untitled').join(', ')}`),
      field('Layer', layerSelect(g, ops.updateGroup)),
      h('button', { class: 'secondary', onclick: () => ctx.actions.ungroup(g.id) }, 'Ungroup (keeps the actors)'),
    ];
  }

  function renderNothing() {
    const lens = mapView.lens;
    return [
      h('h2', {}, 'Map'),
      field('Name', h('input', { value: store.map.name, onchange: (e) => store.apply(ops.renameMap(e.target.value)) })),
      h('p', { class: 'muted' }, lens.description ?? ''),
      h('ul', { class: 'tips' },
        h('li', {}, 'Press A and click to add actors, as many as you like. Press A again or Esc to stop.'),
        h('li', {}, 'Press C and drag between actors to connect them, again and again.'),
        h('li', {}, 'Drag a box to select several. Ctrl or ⌘ + G groups them.'),
        h('li', {}, 'Select a connector, then drag its round ends to re-dock it.'),
        h('li', {}, 'Scroll or hold Space to pan, Ctrl or ⌘ + scroll to zoom, F to fit.'),
      ),
    ];
  }

  function render() {
    if (el.contains(document.activeElement)) return; // don't clobber a field being typed in
    const { actorIds, connectorIds, groupIds } = mapView.selectedItems();
    const count = actorIds.length + connectorIds.length + groupIds.length;
    let body;
    if (count > 1) {
      body = [
        h('h2', {}, `${count} selected`),
        actorIds.length > 1 && h('button', { onclick: () => ctx.actions.groupSelection() }, 'Group these actors (Ctrl+G)'),
        h('p', { class: 'muted' }, 'Press Delete to remove them.'),
      ];
    } else if (actorIds.length) body = renderActor(store.map.actors[actorIds[0]]);
    else if (connectorIds.length) body = renderConnector(store.map.connectors[connectorIds[0]]);
    else if (groupIds.length) body = renderGroup(store.map.groups[groupIds[0]]);
    else body = renderNothing();
    el.replaceChildren(...body);
  }

  mapView.addEventListener('selection', render);
  store.addEventListener('change', render);
  el.addEventListener('focusout', () => setTimeout(render));
  render();
}

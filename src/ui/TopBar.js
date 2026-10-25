import { h, options } from './dom.js';
import { exportMap, importMap } from '../persistence/file.js';
import { icon } from './icons.js';
import { MapDetails } from './MapDetails.js';

/** Lens picker, undo/redo and file actions. */
export function TopBar(el, ctx) {
  const { store, ops, mapView } = ctx;
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      store.load(ctx.actions.migrate(await importMap(file)));
      mapView.select([]);
    } catch (err) {
      alert(`Couldn't open that file: ${err.message}`);
    }
  } });

  const lensSelect = h('select', { 'aria-label': 'Systems lens', onchange: (e) => store.apply(ops.setLens(e.target.value)) });
  const undo = h('button', { class: 'btn btn-sm', title: 'Undo (Ctrl+Z)', onclick: () => store.undo() }, 'Undo');
  const redo = h('button', { class: 'btn btn-sm', title: 'Redo (Ctrl+Shift+Z)', onclick: () => store.redo() }, 'Redo');

  const mapSelect = h('select', { 'aria-label': 'Map', class: 'map-picker', onchange: (e) => {
    if (e.target.value === '__new') {
      const title = prompt('Name of the new map', 'Untitled map');
      if (title?.trim()) ctx.actions.newMap(title.trim());
      else e.target.value = ctx.mapId;
    } else ctx.actions.openMap(e.target.value);
  } },
    options(Object.values(ctx.index.maps).map((m) => ({ id: m.id, label: m.title })), ctx.mapId),
    h('option', { value: '__new' }, '+ New map…'));

  el.append(
    h('label', { class: 'lens-picker' }, h('span', {}, 'Map'), mapSelect),
    h('button', { class: 'btn btn-sm btn-ghost', title: 'Title, description, owner and members', onclick: () => MapDetails(ctx) }, 'Details'),
    h('label', { class: 'lens-picker' }, h('span', {}, 'Lens'), lensSelect),
    h('div', { class: 'join' },
      h('button', { class: 'btn btn-sm icon-text join-item', title: 'Fit the lens to the screen (F)', onclick: () => ctx.actions.fitView() }, icon('fit', 18), 'Fit'),
      h('button', { class: 'btn btn-sm icon-text join-item', title: 'Space the actors out evenly for this lens. Each stays in its zone and layer. Undo puts them back.', onclick: () => ctx.actions.tidy() }, icon('tidy', 18), 'Tidy')),
    h('div', { class: 'spacer' }),
    undo,
    redo,
    h('button', { class: 'btn btn-sm', title: 'Load the example test map', onclick: () => { if (confirm('Load the example test map into this map? Its contents are replaced.')) ctx.actions.loadExample(); } }, 'Example'),
    h('button', { class: 'btn btn-sm', onclick: () => fileInput.click() }, 'Open…'),
    h('button', { class: 'btn btn-sm btn-primary', onclick: () => exportMap(store.map) }, 'Export'),
    fileInput,
  );

  const render = () => {
    lensSelect.replaceChildren(...options([...mapView.lenses.values()].map((l) => ({ id: l.id, label: l.name })), store.map.lensId));
    undo.disabled = !store.undoStack.length;
    redo.disabled = !store.redoStack.length;
  };
  store.addEventListener('change', render);
  render();
}

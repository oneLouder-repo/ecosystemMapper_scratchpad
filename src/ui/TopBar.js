import { h, options } from './dom.js';
import { exportMap, importMap } from '../persistence/file.js';
import { icon } from './icons.js';

/** Lens picker, undo/redo and file actions. */
export function TopBar(el, ctx) {
  const { store, ops, mapView } = ctx;
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      store.load(await importMap(file));
      mapView.select([]);
    } catch (err) {
      alert(`Couldn't open that file: ${err.message}`);
    }
  } });

  const lensSelect = h('select', { 'aria-label': 'Systems lens', onchange: (e) => store.apply(ops.setLens(e.target.value)) });
  const undo = h('button', { class: 'secondary', title: 'Undo (Ctrl+Z)', onclick: () => store.undo() }, 'Undo');
  const redo = h('button', { class: 'secondary', title: 'Redo (Ctrl+Shift+Z)', onclick: () => store.redo() }, 'Redo');

  el.append(
    h('div', { class: 'brand' }, 'Ecosystem Mapper'),
    h('label', { class: 'lens-picker' }, h('span', {}, 'Lens'), lensSelect),
    h('button', { class: 'secondary icon-text', title: 'Fit the lens to the screen (F)', onclick: () => ctx.actions.fitView() }, icon('fit', 18), 'Fit'),
    h('div', { class: 'spacer' }),
    undo,
    redo,
    h('button', { class: 'secondary', onclick: () => { if (confirm('Start a new, empty map? The current one is replaced.')) ctx.actions.newMap(); } }, 'New'),
    h('button', { class: 'secondary', onclick: () => fileInput.click() }, 'Open…'),
    h('button', { onclick: () => exportMap(store.map) }, 'Export'),
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

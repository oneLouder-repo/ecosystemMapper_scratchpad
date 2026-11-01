import { h, options } from './dom.js';
import { exportMap, importMap } from '../persistence/file.js';
import { icon } from './icons.js';
import { MapDetails } from './MapDetails.js';
import { MapHelp } from './MapHelp.js';

/**
 * The mapper's top bar: the map's name (click to rename), map help, the
 * lens, fit and tidy, undo and redo, the Panels menu, and Open and Save
 * for Dashi map files.
 */
export function TopBar(el, ctx) {
  const { store, ops, mapView } = ctx;
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { map, entry } = await importMap(file);
      OpenChoice(ctx, ctx.actions.migrate(map), entry);
    } catch (err) {
      alert(`Couldn't open that file: ${err.message}`);
    }
  } });

  // The name, edited in place.
  const name = h('input', {
    class: 'map-name', 'aria-label': 'Map name', title: 'Click to rename this map', spellcheck: false,
    value: ctx.index.maps[ctx.mapId]?.title ?? '',
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = store.map.name; e.target.blur(); } },
    onchange: (e) => {
      const title = e.target.value.trim();
      if (!title) { e.target.value = store.map.name; return; }
      ctx.actions.updateEntry({ title });
      store.apply(ops.renameMap(title));
      document.dispatchEvent(new CustomEvent('dashi:map-renamed'));
    },
  });
  const fitName = () => { name.style.width = `${Math.min(34, Math.max(6, name.value.length + 1))}ch`; };
  name.addEventListener('input', fitName);

  const lensSelect = h('select', { class: 'select select-sm', 'aria-label': 'Systems lens', title: 'The systems lens behind the map', onchange: (e) => { store.apply(ops.setLens(e.target.value)); requestAnimationFrame(() => ctx.actions.fitView()); } });
  const undo = h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => store.undo() }, '↶');
  const redo = h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', onclick: () => store.redo() }, '↷');

  const panelsMenu = h('ul', { class: 'dropdown-content menu panels-menu', tabindex: 0 });
  const drawPanelsMenu = () => panelsMenu.replaceChildren(
    ...ctx.dock.panels.map((p) => h('li', {}, h('label', { class: 'panels-item' },
      h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: !ctx.dock.state[p.id].hidden, onchange: (e) => ctx.dock.toggle(p.id, e.target.checked) }),
      p.title))),
    h('li', {}, h('button', { type: 'button', onclick: () => { ctx.dock.reset(); drawPanelsMenu(); } }, 'Reset the layout')));

  el.append(
    name,
    h('button', { class: 'btn btn-sm btn-ghost btn-square', title: 'About this map and its lens, and how to use the mapper', 'aria-label': 'Map help', onclick: () => MapHelp(ctx) }, icon('help', 18)),
    h('button', { class: 'btn btn-sm btn-ghost', title: 'Description, owner and members', onclick: () => MapDetails(ctx) }, 'Sharing'),
    h('span', { class: 'topbar-sep' }),
    lensSelect,
    h('div', { class: 'join' },
      h('button', { class: 'btn btn-sm icon-text join-item', title: 'Fit the whole map to the screen (F)', onclick: () => ctx.actions.fitView() }, icon('fit', 18), 'Fit'),
      h('button', { class: 'btn btn-sm icon-text join-item', title: 'Space the actors out evenly for this lens. Each stays in its zone and layer. Undo puts them back.', onclick: () => ctx.actions.tidy() }, icon('tidy', 18), 'Tidy')),
    undo,
    redo,
    h('div', { class: 'spacer' }),
    h('div', { class: 'dropdown dropdown-end' },
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', tabindex: 0, onclick: drawPanelsMenu }, 'Panels ▾'),
      panelsMenu),
    h('button', { class: 'btn btn-sm', title: 'Open a Dashi map file (.dashi-map.json)', onclick: () => fileInput.click() }, icon('upload', 16), 'Open'),
    h('button', { class: 'btn btn-sm btn-primary', title: 'Save this map as a Dashi map file, to keep offline or archive', onclick: () => exportMap(store.map, { entry: ctx.index.maps[ctx.mapId], org: ctx.org }) }, icon('download', 16), 'Save file'),
    fileInput,
  );

  const render = () => {
    lensSelect.replaceChildren(...options([...mapView.lenses.values()].map((l) => ({ id: l.id, label: l.name })), store.map.lensId));
    if (document.activeElement !== name) name.value = store.map.name || ctx.index.maps[ctx.mapId]?.title || '';
    fitName();
    undo.disabled = !store.undoStack.length;
    redo.disabled = !store.redoStack.length;
  };
  store.addEventListener('change', render);
  render();
}

/** After picking a file: open it as a new map, or replace this one. */
function OpenChoice(ctx, map, entry) {
  const counts = `${Object.keys(map.actors).length} actors, ${Object.keys(map.connectors).length} connectors`;
  const dialog = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-box' },
      h('h3', { class: 'text-lg font-bold' }, `Open “${entry.title || 'Untitled map'}”`),
      h('p', { class: 'muted' }, `${counts}. ${entry.description || ''}`),
      h('div', { class: 'modal-action' },
        h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => dialog.close() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn btn-sm', title: 'This map’s contents are replaced by the file’s', onclick: () => { dialog.close(); ctx.actions.replaceWith(map); } }, 'Replace this map'),
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => { dialog.close(); ctx.actions.openAsNew(map, entry); } }, 'Open as a new map'))),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

import { h, options } from './dom.js';
import { exportMap, importMap } from '../persistence/file.js';
import { icon } from './icons.js';
import { MapDetails } from './MapDetails.js';
import { MapHelp } from './MapHelp.js';
import { toast } from './Shell.js';

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

  // Panels: show or hide each one, choose where it sits (left, right or floating) and its place in
  // the column, and tidy the lot.
  const panelsMenu = h('div', { class: 'dropdown-content panels-menu', tabindex: 0 });
  const where = [['left', 'dockLeft', 'Dock at the left'], ['float', 'float', 'Float over the board'], ['right', 'dockRight', 'Dock at the right']];
  const drawPanelsMenu = () => {
    // Redrawing removes the button that had focus, which would close the dropdown: keep focus in it.
    if (panelsMenu.contains(document.activeElement)) panelsMenu.focus({ preventScroll: true });
    drawPanelsBody();
  };
  const drawPanelsBody = () => panelsMenu.replaceChildren(
    h('p', { class: 'panels-title' }, 'Panels'),
    h('ul', { class: 'panels-list' }, ctx.dock.panels.map((p) => {
      const s = ctx.dock.state[p.id];
      const redraw = (fn) => () => { fn(); drawPanelsMenu(); };
      return h('li', { class: `panels-row${s.hidden ? ' off' : ''}` },
        h('label', { class: 'panels-item', title: s.hidden ? `Show ${p.title}` : `Hide ${p.title}` },
          h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: !s.hidden, disabled: p.closable === false, onchange: (e) => { ctx.dock.toggle(p.id, e.target.checked); drawPanelsMenu(); } }),
          p.title),
        h('span', { class: 'panels-where join' }, where.map(([id, glyph, label]) =>
          h('button', { type: 'button', class: `btn btn-xs join-item${s.dock === id ? ' btn-active' : ''}`, title: label, 'aria-label': `${p.title}: ${label}`, 'aria-pressed': String(s.dock === id),
            onclick: redraw(() => ctx.dock.place(p.id, id)) }, icon(glyph, 14)))),
        h('span', { class: 'panels-order' },
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost btn-square', title: 'Move up in its column', 'aria-label': `Move ${p.title} up`, disabled: s.dock === 'float' || s.hidden, onclick: redraw(() => ctx.dock.move(p.id, -1)) }, '↑'),
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost btn-square', title: 'Move down in its column', 'aria-label': `Move ${p.title} down`, disabled: s.dock === 'float' || s.hidden, onclick: redraw(() => ctx.dock.move(p.id, 1)) }, '↓')));
    })),
    h('div', { class: 'panels-actions' },
      h('button', { type: 'button', class: 'btn btn-xs', title: 'Dock every floating panel back at its edge', onclick: () => { ctx.dock.gather(); drawPanelsMenu(); } }, 'Gather'),
      h('button', { type: 'button', class: 'btn btn-xs', title: 'Fold every panel to its title bar', onclick: () => { ctx.dock.foldAll(true); drawPanelsMenu(); } }, 'Fold all'),
      h('button', { type: 'button', class: 'btn btn-xs', title: 'Unfold every panel', onclick: () => { ctx.dock.foldAll(false); drawPanelsMenu(); } }, 'Unfold all'),
      h('button', { type: 'button', class: 'btn btn-xs', title: 'Each panel back where it started, in order and unfolded (hidden ones stay hidden)', onclick: () => { ctx.dock.tidy(); drawPanelsMenu(); } }, 'Tidy'),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost', title: 'Start over: every panel shown, docked and unfolded', onclick: () => { ctx.dock.reset(); drawPanelsMenu(); } }, 'Reset')),
    h('p', { class: 'panels-tip' }, 'Tip: drag a panel by its title bar; drop it at an edge to dock it. Double-click a title bar to fold it.'));

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
      h('button', { type: 'button', class: 'btn btn-sm btn-ghost', tabindex: 0, title: 'Show, hide, dock and tidy the tool panels', onclick: drawPanelsMenu, onfocus: drawPanelsMenu }, 'Panels ▾'),
      panelsMenu),
    h('button', { class: 'btn btn-sm', title: 'Open a Dashi map file (.dashi-map.json)', onclick: () => fileInput.click() }, icon('upload', 16), 'Open'),
    ctx.actions.hasLibrary() && h('button', { class: 'btn btn-sm', title: 'Keep a copy of this map as a file in the library, where it can be tagged, put in a bibliography or attached to work as an asset. Saving again updates it.', onclick: async (e) => {
      e.currentTarget.disabled = true;
      try { toast((await ctx.actions.saveToLibrary()) === 'added' ? 'Saved to the library as a map file' : 'Updated the map file in the library'); }
      catch (err) { toast(`Couldn’t save to the library: ${err.message}`, 'error'); }
      finally { e.target.closest('button').disabled = false; }
    } }, icon('book', 16), 'To library'),
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
export function OpenChoice(ctx, map, entry) {
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

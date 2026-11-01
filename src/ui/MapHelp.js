import { h } from './dom.js';

/** About this map, its lens, and how to use the mapper. */
export function MapHelp(ctx) {
  const lens = ctx.mapView.lens;
  const entry = ctx.index.maps[ctx.mapId] ?? {};
  const regions = (lens.regions ?? []).filter((r) => r.label);
  const tips = [
    ['Add', 'Click Actor or Agent in Tools to add one, or drag it onto the board. A adds one where the pointer is; double-click empty board adds one there.'],
    ['Connect', 'Drag from the small box on an actor’s top-left corner to another actor. Select a connector and drag its round ends to re-dock it.'],
    ['Details', 'Double-click an actor, agent or connector (or press Enter, or Details on the bar at the bottom) to open its details.'],
    ['Select', 'Drag a box on empty board to select several. Ctrl or ⌘ + G groups them. Click a zone of the lens to make its actors signal.'],
    ['Data viz', 'Press D, then click anything to light up what it’s connected to for 15 seconds.'],
    ['Move around', 'Scroll or hold Space to pan, Ctrl or ⌘ + scroll to zoom, F to fit the whole map, Tidy to space actors out.'],
    ['Panels', 'Drag a panel by its title bar. Drop it near the left or right edge to dock it, anywhere else to float it. Panels ▾ shows hidden ones.'],
    ['Files', 'Save file keeps a copy of the map as a .dashi-map.json file, to work offline or archive. Open brings one back, as a new map or in place of this one.'],
  ];
  const dialog = h('dialog', { class: 'modal' },
    h('div', { class: 'modal-box map-help' },
      h('h3', {}, entry.title || 'This map'),
      entry.description && h('p', {}, entry.description),
      h('h4', {}, `The lens: ${lens.name}`),
      lens.description && h('p', { class: 'muted' }, lens.description),
      regions.length > 0 && h('dl', { class: 'map-help-regions' }, regions.map((r) => [h('dt', {}, r.label), h('dd', {}, r.hint ?? '')])),
      h('h4', {}, 'Using the mapper'),
      h('dl', { class: 'map-help-tips' }, tips.map(([t, d]) => [h('dt', {}, t), h('dd', {}, d)])),
      h('div', { class: 'modal-action' }, h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => dialog.close() }, 'Close'))),
    h('form', { method: 'dialog', class: 'modal-backdrop' }, h('button', {}, 'close')));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

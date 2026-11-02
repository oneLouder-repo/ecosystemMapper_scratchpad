import { Stage } from './core/Stage.js';
import { Store } from './core/Store.js';
import { ops, uid } from './core/ops.js';
import { MapView } from './display/MapView.js';
import { lensBounds, loadLenses, unproject, regionAt } from './lenses/index.js';
import { tidyPlaces } from './lenses/tidy.js';
import { ToolRegistry } from './tools/registry.js';
import SelectTool from './tools/SelectTool.js';
import ConnectTool from './tools/ConnectTool.js';
import PanTool from './tools/PanTool.js';
import DataVizTool from './tools/DataVizTool.js';
import { Toolbar } from './ui/Toolbar.js';
import { TopBar } from './ui/TopBar.js';
import { ItemDetails } from './ui/Inspector.js';
import { DockPanels } from './ui/DockPanels.js';
import { Tooltips } from './ui/Tooltip.js';
import { SelectionBar } from './ui/SelectionBar.js';
import { LayersPanel } from './ui/LayersPanel.js';
import { LabelEditor } from './ui/LabelEditor.js';
import { migrateMap } from './seed.js';
import { Shell } from './ui/Shell.js';
import { h } from './ui/dom.js';
import { autosaveDoc, saveDoc } from './platform/storage.js';
import { loadOrg, loadMaps } from './platform/docs.js';
import { loadMapContent, mapDocName, createMapIn } from './platform/maps.js';
import { currentUser } from './platform/session.js';

const org = loadOrg();
Shell(document.querySelector('#shell'), { current: 'mapper', org });

// Which map: mapper.html#<mapId>, else the first map this org has (making one if none).
const index = loadMaps();
let mapId = decodeURIComponent(location.hash.slice(1));
if (!index.maps[mapId]) {
  mapId = Object.keys(index.maps)[0] ?? createMapIn(index, { title: 'Our ecosystem', ownerId: currentUser(org)?.id }).id;
  history.replaceState(null, '', `#${mapId}`);
}
window.addEventListener('hashchange', () => location.reload());

const lenses = await loadLenses();
const store = new Store(migrateMap(loadMapContent(mapId), lenses));
const stage = new Stage(document.querySelector('#board'));
const mapView = new MapView(stage, store, lenses);

/**
 * Zoom and centre so the whole map fits the board: the lens backdrop and
 * every actor, wide or tall, clear of the docked panels.
 */
let fittedCamera = null;
function fitView() {
  const b = { ...lensBounds(mapView.lens) };
  for (const a of Object.values(mapView.world.actors)) {
    const x0 = Math.min(b.x, a.x - a.w / 2), y0 = Math.min(b.y, a.y - a.h / 2);
    const x1 = Math.max(b.x + b.w, a.x + a.w / 2), y1 = Math.max(b.y + b.h, a.y + a.h / 2);
    Object.assign(b, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  const { clientWidth, clientHeight } = stage.svgEl;
  if (!clientWidth || !clientHeight) return;
  const box = stage.svgEl.getBoundingClientRect();
  const inset = (sel, side) => {
    const col = document.querySelector(sel);
    if (!col?.children.length) return 0;
    const r = col.getBoundingClientRect();
    return side === 'left' ? Math.max(0, r.right - box.left) : Math.max(0, box.right - r.left);
  };
  const left = inset('.dock-left', 'left'), right = inset('.dock-right', 'right');
  const pad = 28;
  const w = clientWidth - left - right - pad * 2, h = clientHeight - pad * 2 - 44; // room for the selection bar
  stage.scale = Math.min(1.75, Math.max(0.15, Math.min(w / b.w, h / b.h)));
  stage.moveTo(left + pad + w / 2 - (b.x + b.w / 2) * stage.scale, pad + h / 2 - (b.y + b.h / 2) * stage.scale);
  stage.dispatchEvent('camera');
  fittedCamera = { x: stage.x, y: stage.y, scale: stage.scale };
}
// Keep it fitted when the window changes size, until someone pans or zooms.
window.addEventListener('resize', () => {
  if (fittedCamera && stage.x === fittedCamera.x && stage.y === fittedCamera.y && stage.scale === fittedCamera.scale) fitView();
});

/**
 * The context every tool and panel receives. Add shared helpers to
 * `actions` rather than reaching into other modules.
 */
/** The board's visible area, in world coordinates. */
function viewRect() {
  const r = stage.svgEl.getBoundingClientRect();
  const a = stage.toWorld(r.left, r.top);
  const b = stage.toWorld(r.right, r.bottom);
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

const ctx = {
  stage,
  store,
  ops,
  mapView,
  tools: null,
  ui: { activeLayerId: store.map.layers[0]?.id, editLabel: null },
  actions: {
    addActorAt(x, y, kind = 'actor') {
      const place = unproject(mapView.lens, x, y);
      const op = store.apply(ops.addActor({ place, kind, category: mapView.lens.defaultCategory, layerId: ctx.ui.activeLayerId }));
      mapView.select([op.id]);
      ctx.ui.editLabel(op.id);
    },
    /** Add an actor near the middle of what's on screen, in a free spot. */
    addActorInView(kind = 'actor', near) {
      const v = viewRect();
      const c = near ?? { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      const taken = Object.values(mapView.world.actors);
      const free = (x, y) => taken.every((a) => Math.abs(a.x - x) > (a.w + 150) / 2 + 8 || Math.abs(a.y - y) > (a.h + 58) / 2 + 8);
      let spot = c;
      for (let i = 0, r = 0; i < 400 && !free(spot.x, spot.y); i++) {
        r = 30 + i * 6;
        const t = i * 2.4;
        spot = { x: c.x + r * Math.cos(t), y: c.y + r * Math.sin(t) * 0.6 };
      }
      ctx.actions.addActorAt(spot.x, spot.y, kind);
    },
    /** The lens region under a screen point (for highlighting while dragging a new actor in). */
    regionAtScreen(clientX, clientY) {
      const w = stage.toWorld(clientX, clientY);
      return regionAt(mapView.lens, unproject(mapView.lens, w.x, w.y))?.id ?? null;
    },
    /** Lay the actors out evenly for this lens, each staying in its zone and layer. One undo puts it back. */
    tidy() {
      const map = store.map;
      const groupOf = (id) => Object.values(map.groups ?? {}).find((g) => g.memberIds.includes(id))?.id ?? null;
      const actors = Object.values(mapView.world.actors).map((a) => ({ id: a.id, place: a.place, w: a.w, h: a.h }));
      const places = tidyPlaces(mapView.lens, actors, { groupOf });
      const moves = Object.entries(places).map(([id, place]) => ops.moveActor(id, place));
      if (moves.length) store.apply(ops.batch(moves));
    },
    /**
     * Ops to move actors to a layer, taking their connectors along: every
     * connector touching one of them that was on that actor's old layer.
     */
    actorsToLayerOps(actorIds, layerId) {
      const map = store.map;
      const base = map.layers[0]?.id;
      const moving = new Set(actorIds);
      const list = actorIds.map((id) => ops.updateActor(id, { layerId }));
      for (const c of Object.values(map.connectors)) {
        const ends = [c.from?.actorId, c.to?.actorId].filter((id) => moving.has(id));
        const travels = ends.some((id) => (map.actors[id].layerId ?? base) === (c.layerId ?? base));
        if (travels && (c.layerId ?? base) !== layerId) list.push(ops.updateConnector(c.id, { layerId }));
      }
      return list;
    },
    /** Move a group, its actors and their connectors onto a new layer named after it. */
    groupToLayer(groupId) {
      const map = store.map;
      const g = map.groups[groupId];
      if (!g) return;
      const layerId = uid('layer');
      const list = [
        ops.addLayer({ id: layerId, name: g.label || 'Group' }),
        ...ctx.actions.actorsToLayerOps(g.memberIds, layerId),
        ops.updateGroup(g.id, { layerId }),
      ];
      store.apply(ops.batch(list));
      ctx.ui.activeLayerId = layerId;
      mapView.select([]);
    },
    deleteSelection() {
      const items = mapView.selectedItems();
      if (!items.actorIds.length && !items.connectorIds.length && !items.groupIds.length) return;
      store.apply(ops.removeItems(store.map, items));
      mapView.select([]);
    },
    fitView,
    groupSelection() {
      const { actorIds } = mapView.selectedItems();
      if (actorIds.length < 2) return;
      const op = store.apply(ops.addGroup({ label: 'New group', memberIds: actorIds, layerId: ctx.ui.activeLayerId }));
      mapView.select([op.id]);
    },
    ungroup(id) {
      store.apply(ops.removeGroup(id));
      mapView.select([]);
    },
    migrate: (map) => migrateMap(map, lenses),
    /** Replace this map's contents with a map from a file (keeps its name and place in the list). */
    replaceWith(map) {
      store.load({ ...map, id: mapId, name: index.maps[mapId].title });
      mapView.select([]);
      requestAnimationFrame(fitView);
    },
    /** Add a map from a file to this org, as a new map, and open it. */
    openAsNew(map, entry) {
      const created = createMapIn(index, { title: entry.title || 'Opened map', ownerId: currentUser(org)?.id, content: structuredClone(map) });
      if (entry.description) { index.maps[created.id].description = entry.description; saveDoc('maps', index); }
      saveDoc(mapDocName(mapId), store.map);
      location.hash = created.id;
    },
    openDetails() { if (mapView.selection.size) ItemDetails(ctx); },
    addLayer() {
      // Active first, so the layers list draws with the new one chosen.
      ctx.ui.activeLayerId = uid('layer');
      store.apply(ops.addLayer({ id: ctx.ui.activeLayerId, name: `Layer ${store.map.layers.length + 1}` }));
    },
    /** Make a new map in this org and open it. */
    newMap(title) {
      const entry = createMapIn(index, { title, ownerId: currentUser(org)?.id, lensId: store.map.lensId });
      saveDoc(mapDocName(mapId), store.map);
      location.hash = entry.id;
    },
    openMap(id) {
      saveDoc(mapDocName(mapId), store.map);
      location.hash = id;
    },
    /** Change the map's title, description, owner or members. */
    updateEntry(patch) {
      Object.assign(index.maps[mapId], patch, { updatedAt: new Date().toISOString().slice(0, 10) });
      saveDoc('maps', index);
      if (patch.title) store.map.name = patch.title;
    },
  },
  org,
  index,
  get mapId() { return mapId; },
};

ctx.tools = new ToolRegistry(ctx).register(SelectTool).register(ConnectTool).register(PanTool).register(DataVizTool);
ctx.ui.editLabel = LabelEditor(ctx);

// Maps, Tools and Layers are separate panels over the board: dock them left or right, or float them.
const toolMenu = h('ul');
const layersEl = h('div', { class: 'side-layers' });
const mapsEl = h('ul', { class: 'menu side-menu dock-maps' });
const drawMaps = () => mapsEl.replaceChildren(...Object.values(index.maps).map((m) =>
  h('li', {}, h('a', { href: `#${m.id}`, class: m.id === mapId ? 'menu-active' : null, title: m.description || m.title }, m.title))));
drawMaps();
document.addEventListener('dashi:map-renamed', drawMaps);
const main = document.querySelector('main');
ctx.dock = DockPanels(main, [
  { id: 'tools', title: 'Tools', body: toolMenu, dock: 'left', compact: true, closable: false },
  { id: 'maps', title: 'Maps', body: mapsEl, dock: 'left', width: 220,
    action: { label: 'New map', onclick: () => { const title = prompt('Name of the new map', 'Untitled map'); if (title?.trim()) ctx.actions.newMap(title.trim()); } } },
  { id: 'layers', title: 'Layers', body: layersEl, dock: 'right', width: 240, action: { label: 'Add layer', onclick: () => ctx.actions.addLayer() } },
], { key: 'dashi.mapper.panels' });
Toolbar(toolMenu, ctx);
TopBar(document.querySelector('#topbar'), ctx);
LayersPanel(layersEl, ctx);
SelectionBar(main, ctx);
Tooltips('#topbar, .dock-panel, .selection-bar, .panels-menu');

ctx.tools.use('select');
mapView.sync();
requestAnimationFrame(() => requestAnimationFrame(fitView));
autosaveDoc(mapDocName(mapId), store);
// The map's name and its title in the org's list of maps stay the same.
store.map.name = index.maps[mapId].title;
store.addEventListener('change', () => {
  if (store.map.name && store.map.name !== index.maps[mapId].title) ctx.actions.updateEntry({ title: store.map.name });
});

// Where the pointer last was on the board, so A adds an actor there.
let pointer = null;
stage.svgEl.addEventListener('pointermove', (e) => { pointer = stage.toWorld(e.clientX, e.clientY); });
stage.svgEl.addEventListener('pointerleave', () => { pointer = null; });

// Hold Space to pan with any tool, FigJam-style.
let toolBeforeSpace = null;
document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && toolBeforeSpace) {
    ctx.tools.use(toolBeforeSpace);
    toolBeforeSpace = null;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === ' ') {
    e.preventDefault();
    if (!toolBeforeSpace && ctx.tools.active.id !== 'pan') {
      toolBeforeSpace = ctx.tools.active.id;
      ctx.tools.use('pan');
    }
    return;
  }
  if (e.key.toLowerCase() === 'f' && !mod) {
    fitView();
    return;
  }
  if (e.key.toLowerCase() === 'a' && !mod && !e.altKey) {
    ctx.actions.addActorInView(e.shiftKey ? 'agent' : 'actor', pointer);
    e.preventDefault();
    return;
  }
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  } else if (mod && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    ctx.actions.groupSelection();
  } else if (mod && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
  } else if (e.key === 'Enter' && mapView.selection.size) {
    e.preventDefault();
    ctx.actions.openDetails();
  } else if (e.key === 'Escape') {
    mapView.select([]);
    ctx.tools.use('select');
  } else if (ctx.tools.handleKey(e)) {
    e.preventDefault();
  }
});

// Handy for poking at things from the browser console.
window.mapper = ctx;

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
import { Inspector } from './ui/Inspector.js';
import { LayersPanel } from './ui/LayersPanel.js';
import { LabelEditor } from './ui/LabelEditor.js';
import { seedMap, migrateMap } from './seed.js';
import { Shell } from './ui/Shell.js';
import { autosaveDoc, saveDoc, onDocChange } from './platform/storage.js';
import { loadOrg, loadMaps, loadStrategy } from './platform/docs.js';
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

/** Zoom and centre so the whole lens backdrop fits the board. */
function fitView() {
  const b = lensBounds(mapView.lens);
  const { clientWidth, clientHeight } = stage.svgEl;
  const pad = 32;
  stage.scale = Math.min(1, Math.max(0.2, Math.min((clientWidth - pad * 2) / b.w, (clientHeight - pad * 2) / b.h)));
  stage.moveTo(clientWidth / 2 - (b.x + b.w / 2) * stage.scale, clientHeight / 2 - (b.y + b.h / 2) * stage.scale);
  stage.dispatchEvent('camera');
}
fitView();

/**
 * The context every tool and panel receives. Add shared helpers to
 * `actions` rather than reaching into other modules.
 */
// The org's strategy, for the data viz tool (which actors are part of planned work).
let strategy = loadStrategy();
onDocChange('strategy', (doc) => { strategy = doc; });

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
  strategy: () => strategy,
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
    /** Move a group, its actors and the connectors between them onto a new layer named after it. */
    groupToLayer(groupId) {
      const map = store.map;
      const g = map.groups[groupId];
      if (!g) return;
      const layerId = uid('layer');
      const list = [ops.addLayer({ id: layerId, name: g.label || 'Group' })];
      const members = new Set(g.memberIds);
      const inside = Object.values(map.connectors).filter((c) => members.has(c.from?.actorId) && members.has(c.to?.actorId));
      for (const id of g.memberIds) list.push(ops.updateActor(id, { layerId }));
      for (const c of inside) list.push(ops.updateConnector(c.id, { layerId }));
      list.push(ops.updateGroup(g.id, { layerId }));
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
    loadExample() {
      store.load({ ...seedMap(), id: mapId, name: index.maps[mapId].title });
      mapView.select([]);
      fitView();
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

Toolbar(document.querySelector('#toolbar'), ctx);
TopBar(document.querySelector('#topbar'), ctx);
Inspector(document.querySelector('#inspector'), ctx);
LayersPanel(document.querySelector('#layers'), ctx);

ctx.tools.use('select');
mapView.sync();
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
  } else if (e.key === 'Escape') {
    mapView.select([]);
    ctx.tools.use('select');
  } else if (ctx.tools.handleKey(e)) {
    e.preventDefault();
  }
});

// Handy for poking at things from the browser console.
window.mapper = ctx;

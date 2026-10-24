import { Stage } from './core/Stage.js';
import { Store } from './core/Store.js';
import { createMap, ops } from './core/ops.js';
import { MapView } from './display/MapView.js';
import { lensBounds, loadLenses, unproject } from './lenses/index.js';
import { ToolRegistry } from './tools/registry.js';
import SelectTool from './tools/SelectTool.js';
import ActorTool from './tools/ActorTool.js';
import ConnectTool from './tools/ConnectTool.js';
import PanTool from './tools/PanTool.js';
import { Toolbar } from './ui/Toolbar.js';
import { TopBar } from './ui/TopBar.js';
import { Inspector } from './ui/Inspector.js';
import { LayersPanel } from './ui/LayersPanel.js';
import { LabelEditor } from './ui/LabelEditor.js';
import { autosave, loadLocal } from './persistence/local.js';
import { seedMap, migrateMap } from './seed.js';
import { Shell } from './ui/Shell.js';
import { loadOrSeed } from './platform/storage.js';
import { seedOrg } from './platform/org.js';

Shell(document.querySelector('#shell'), { current: 'mapper', org: loadOrSeed('org', seedOrg) });

const lenses = await loadLenses();
const store = new Store(migrateMap(loadLocal(), lenses) ?? seedMap());
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
const ctx = {
  stage,
  store,
  ops,
  mapView,
  tools: null,
  ui: { activeLayerId: store.map.layers[0]?.id, editLabel: null },
  actions: {
    addActorAt(x, y) {
      const place = unproject(mapView.lens, x, y);
      const op = store.apply(ops.addActor({ place, category: mapView.lens.defaultCategory, layerId: ctx.ui.activeLayerId }));
      mapView.select([op.id]);
      ctx.ui.editLabel(op.id);
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
      store.load(seedMap());
      mapView.select([]);
      fitView();
    },
    newMap() {
      store.load(createMap({ lensId: store.map.lensId }));
      mapView.select([]);
    },
  },
};

ctx.tools = new ToolRegistry(ctx).register(SelectTool).register(ActorTool).register(ConnectTool).register(PanTool);
ctx.ui.editLabel = LabelEditor(ctx);

Toolbar(document.querySelector('#toolbar'), ctx.tools);
TopBar(document.querySelector('#topbar'), ctx);
Inspector(document.querySelector('#inspector'), ctx);
LayersPanel(document.querySelector('#layers'), ctx);

ctx.tools.use('select');
mapView.sync();
autosave(store);

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

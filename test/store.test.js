import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/core/Store.js';
import { createMap, ops } from '../src/core/ops.js';

function setup() {
  const store = new Store(createMap());
  const a = store.apply(ops.addActor({ label: 'A', x: 0, y: 0 })).id;
  const b = store.apply(ops.addActor({ label: 'B', x: 300, y: 0 })).id;
  const c = store.apply(ops.addConnector({ from: { actorId: a }, to: { actorId: b } })).id;
  return { store, a, b, c };
}

test('add, move, undo and redo an actor', () => {
  const { store, a } = setup();
  store.apply(ops.moveActor(a, 50, 60));
  assert.deepEqual([store.map.actors[a].x, store.map.actors[a].y], [50, 60]);
  store.undo();
  assert.deepEqual([store.map.actors[a].x, store.map.actors[a].y], [0, 0]);
  store.redo();
  assert.deepEqual([store.map.actors[a].x, store.map.actors[a].y], [50, 60]);
});

test('preview ops skip history and a final op can carry its own inverse', () => {
  const { store, a } = setup();
  const depth = store.undoStack.length;
  store.apply(ops.moveActor(a, 10, 10), { history: false });
  store.apply(ops.moveActor(a, 20, 20), { history: false });
  store.apply(ops.moveActor(a, 30, 30), { inverse: ops.moveActor(a, 0, 0) });
  assert.equal(store.undoStack.length, depth + 1);
  store.undo();
  assert.equal(store.map.actors[a].x, 0);
  store.redo();
  assert.equal(store.map.actors[a].x, 30);
});

test('update restores previous values on undo', () => {
  const { store, a } = setup();
  store.apply(ops.updateActor(a, { label: 'Renamed', category: 'ally' }));
  store.undo();
  assert.equal(store.map.actors[a].label, 'A');
  assert.equal(store.map.actors[a].category, 'other');
});

test('removing an actor removes its connectors and undo brings both back', () => {
  const { store, a, c } = setup();
  store.apply(ops.removeItems(store.map, { actorIds: [a] }));
  assert.equal(store.map.actors[a], undefined);
  assert.equal(store.map.connectors[c], undefined);
  store.undo();
  assert.equal(store.map.actors[a].label, 'A');
  assert.deepEqual(store.map.connectors[c].from, { actorId: a });
});

test('re-docking a connector end is undoable', () => {
  const { store, b, c } = setup();
  store.apply(ops.dockConnector(c, 'to', { x: 5, y: 5 }));
  assert.deepEqual(store.map.connectors[c].to, { x: 5, y: 5 });
  store.undo();
  assert.deepEqual(store.map.connectors[c].to, { actorId: b });
});

test('layers can be added, updated and removed with undo', () => {
  const { store } = setup();
  const id = store.apply(ops.addLayer({ name: 'Funders' })).id;
  store.apply(ops.updateLayer(id, { visible: false }));
  assert.equal(store.map.layers[1].visible, false);
  store.apply(ops.removeLayer(id));
  assert.equal(store.map.layers.length, 1);
  store.undo();
  assert.equal(store.map.layers[1].name, 'Funders');
});

test('switching lens never touches actor data', () => {
  const { store, a } = setup();
  store.apply(ops.updateActor(a, { category: 'ally' }));
  store.apply(ops.setLens('water-of-systems-change'));
  assert.equal(store.map.actors[a].category, 'ally');
  store.undo();
  assert.equal(store.map.lensId, 'micro-meso-macro');
});

test('change events fire for apply, undo and redo', () => {
  const { store, a } = setup();
  const seen = [];
  store.addEventListener('change', (e) => seen.push(e.op.op));
  store.apply(ops.moveActor(a, 1, 1));
  store.undo();
  store.redo();
  assert.deepEqual(seen, ['moveActor', 'moveActor', 'moveActor']);
});

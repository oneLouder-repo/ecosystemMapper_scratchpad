import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/core/Store.js';
import { createMap, ops } from '../src/core/ops.js';

function setup() {
  const store = new Store(createMap());
  const a = store.apply(ops.addActor({ label: 'A', place: { depth: 0, spread: 0 } })).id;
  const b = store.apply(ops.addActor({ label: 'B', place: { depth: 0.5, spread: 0.5 } })).id;
  const c = store.apply(ops.addConnector({ from: { actorId: a }, to: { actorId: b } })).id;
  return { store, a, b, c };
}

const at = (depth, spread = 0) => ({ depth, spread });

test('add, move, undo and redo an actor', () => {
  const { store, a } = setup();
  store.apply(ops.moveActor(a, at(0.7, 0.2)));
  assert.deepEqual(store.map.actors[a].place, at(0.7, 0.2));
  store.undo();
  assert.deepEqual(store.map.actors[a].place, at(0));
  store.redo();
  assert.deepEqual(store.map.actors[a].place, at(0.7, 0.2));
});

test('preview ops skip history and a final op can carry its own inverse', () => {
  const { store, a } = setup();
  const depth = store.undoStack.length;
  store.apply(ops.moveActor(a, at(0.1)), { history: false });
  store.apply(ops.moveActor(a, at(0.2)), { history: false });
  store.apply(ops.moveActor(a, at(0.3)), { inverse: ops.moveActor(a, at(0)) });
  assert.equal(store.undoStack.length, depth + 1);
  store.undo();
  assert.equal(store.map.actors[a].place.depth, 0);
  store.redo();
  assert.equal(store.map.actors[a].place.depth, 0.3);
});

test('groups: removing a member actor updates the group, undo restores it', () => {
  const { store, a, b } = setup();
  const g = store.apply(ops.addGroup({ label: 'Funders', memberIds: [a, b] })).id;
  store.apply(ops.removeItems(store.map, { actorIds: [a] }));
  assert.deepEqual(store.map.groups[g].memberIds, [b]);
  store.undo();
  assert.deepEqual(store.map.groups[g].memberIds, [a, b]);
  store.apply(ops.removeItems(store.map, { groupIds: [g] }));
  assert.equal(store.map.groups[g], undefined);
  assert.ok(store.map.actors[a], 'ungrouping keeps the actors');
});

test('actor and agent kinds toggle with undo', () => {
  const { store, a } = setup();
  assert.equal(store.map.actors[a].kind, 'actor');
  store.apply(ops.updateActor(a, { kind: 'agent' }));
  store.undo();
  assert.equal(store.map.actors[a].kind, 'actor');
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
  store.apply(ops.moveActor(a, at(0.4)));
  store.undo();
  store.redo();
  assert.deepEqual(seen, ['moveActor', 'moveActor', 'moveActor']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/core/Store.js';
import { applyCollectionOp, col } from '../src/core/collections.js';
import { seedStrategy } from '../src/platform/strategySeed.js';
import { seedOrg } from '../src/platform/org.js';
import { strategyOps, childrenOf, rootOf, descendants, dateSpan, taskSummary } from '../src/platform/strategy.js';

const setup = () => new Store(seedStrategy(), applyCollectionOp);
const find = (doc, title) => Object.values(doc.nodes).find((n) => n.title === title);

test('the example strategy is one tree from framework to tasks', () => {
  const { doc } = setup();
  const root = rootOf(doc);
  assert.equal(root.type, 'framework');
  const master = childrenOf(doc, root.id)[0];
  assert.equal(master.type, 'plan');
  assert.equal(childrenOf(doc, master.id)[0].type, 'plan', 'plans nest inside plans');
  const tasks = descendants(doc, root.id).filter((n) => n.type === 'task');
  assert.ok(tasks.length >= 20);
});

test('the example strategy only assigns staff that exist in the example org', () => {
  const { doc } = setup();
  const org = seedOrg();
  for (const n of Object.values(doc.nodes)) {
    for (const id of [...(n.staffIds ?? []), ...(n.assigneeIds ?? [])]) assert.ok(org.staff[id], id);
    for (const id of n.teamIds ?? []) assert.ok(org.teams[id], id);
  }
});

test('child types are enforced', () => {
  const { doc } = setup();
  const root = rootOf(doc);
  assert.throws(() => strategyOps.addNode(doc, { type: 'task', parentId: root.id }));
  assert.doesNotThrow(() => strategyOps.addNode(doc, { type: 'plan', parentId: root.id }));
});

test('removing a node removes its subtree in one undo step', () => {
  const store = setup();
  const wp = find(store.doc, 'Instructor training refresh');
  const before = Object.keys(store.doc.nodes).length;
  store.apply(strategyOps.removeNode(store.doc, wp.id));
  assert.equal(Object.keys(store.doc.nodes).length, before - 6);
  store.undo();
  assert.equal(Object.keys(store.doc.nodes).length, before);
  assert.equal(childrenOf(store.doc, wp.id).length, 5);
});

test('status changes are recorded on the task timeline and undo together', () => {
  const store = setup();
  const task = find(store.doc, 'Draft new modules');
  store.apply(strategyOps.setStatus(store.doc, task.id, 'active', '2026-11-02'));
  assert.equal(store.doc.nodes[task.id].status, 'active');
  assert.equal(store.doc.nodes[task.id].events.at(-1).kind, 'status');
  store.undo();
  assert.equal(store.doc.nodes[task.id].status, 'planned');
  assert.equal(store.doc.nodes[task.id].events.length, 0);
});

test('date spans and task summaries roll up', () => {
  const { doc } = setup();
  const wp = find(doc, 'Instructor training refresh');
  assert.deepEqual(dateSpan(doc, wp.id), { start: '2026-09-01', end: '2027-02-28' });
  const s = taskSummary(doc, wp.id);
  assert.equal(s.total, 5);
  assert.equal(s.done, 1);
});

test('collection ops: set and batch undo cleanly', () => {
  const store = new Store(seedOrg(), applyCollectionOp);
  store.apply(col.batch([col.set('name', 'Renamed'), col.add('teams', { name: 'Board' })]));
  assert.equal(store.doc.name, 'Renamed');
  store.undo();
  assert.equal(store.doc.name, 'Example STEM Outreach Network');
  assert.equal(Object.keys(store.doc.teams).length, 5);
});

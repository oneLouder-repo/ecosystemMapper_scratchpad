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

test('strategy reports: treemap layout, workplan progress and roadmap lights', async () => {
  const { squarify, strategyTree, workplanProgress, roadmap, lightOf } = await import('../src/platform/strategyReports.js');
  const rects = squarify([{ value: 6 }, { value: 6 }, { value: 4 }, { value: 3 }, { value: 2 }, { value: 2 }, { value: 1 }], { x: 0, y: 0, w: 600, h: 400 });
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  assert.ok(Math.abs(area - 600 * 400) < 1e-6, 'the rectangles fill the space');
  for (const r of rects) assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 600 + 1e-6 && r.y + r.h <= 400 + 1e-6, 'and stay inside it');
  assert.ok(Math.abs(rects.find((r) => r.item.value === 6).w * rects.find((r) => r.item.value === 6).h - 600 * 400 * 6 / 24) < 1e-6, 'area follows value');

  const doc = seedStrategy();
  const tree = strategyTree(doc);
  const leaves = [];
  const walk = (t) => (t.children.length ? t.children.forEach(walk) : leaves.push(t.node.type));
  walk(tree);
  assert.ok(leaves.includes('workplan') && !leaves.includes('task'), 'the treemap stops at workplans');

  const rows = roadmap(doc);
  assert.equal(rows.length, Object.values(doc.nodes).filter((n) => n.type === 'workplan').length);
  const tasks = rows.flatMap((r) => r.tasks);
  assert.equal(tasks.length, Object.values(doc.nodes).filter((n) => n.type === 'task').length, 'every task is on the roadmap once');
  assert.deepEqual(['done', 'active', 'blocked', 'planned'].map((status) => lightOf({ status })), ['green', 'amber', 'amber', 'red']);

  const wp = rows.find((r) => r.workplan.title === 'Instructor training refresh').workplan;
  const early = workplanProgress(doc, wp.id, '2026-08-01');
  assert.equal(early.expected, 0);
  const late = workplanProgress(doc, wp.id, '2027-03-15');
  assert.equal(late.expected, 100);
  assert.equal(late.state, 'behind', 'one task of five done after the end date');
  assert.equal(late.pct, 20);
});

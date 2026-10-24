import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedStrategy } from '../src/platform/strategySeed.js';
import { seedOrg } from '../src/platform/org.js';
import { seedMap } from '../src/seed.js';
import { measureIndex, measuresUnder, migrateStrategy, statusAt } from '../src/platform/strategy.js';
import { seedData, valueAt, pointsUntil, dataMonths } from '../src/platform/data.js';
import { dashboardFromNode, dashboardMonths, seedDashboards, WIDGET_TYPES } from '../src/platform/dashboards.js';
import { resolveAsset, assetsInWorkplan, assetsUnder, groupAssets, assetKey, ASSET_KINDS } from '../src/platform/assets.js';

const strategy = () => migrateStrategy(seedStrategy());
const find = (doc, title) => Object.values(doc.nodes).find((n) => n.title === title);

test('every measure in the example strategy has program data', () => {
  const s = strategy();
  const data = seedData();
  const ids = Object.keys(measureIndex(s));
  assert.ok(ids.length >= 9);
  for (const id of ids) assert.ok(data.series[id]?.points.length >= 12, `data for ${id}`);
});

test('migrateStrategy gives measures ids and tasks an asset list', () => {
  const doc = seedStrategy();
  const goal = Object.values(doc.nodes).find((n) => n.type === 'goal');
  goal.measures.push({ name: 'New measure', target: '', unit: '' });
  const task = Object.values(doc.nodes).find((n) => n.type === 'task');
  delete task.assets;
  migrateStrategy(doc);
  assert.ok(goal.measures.at(-1).id);
  assert.deepEqual(task.assets, []);
});

test('valueAt finds the latest value on or before a date', () => {
  const series = { points: [{ date: '2026-01-01', value: 1 }, { date: '2026-02-01', value: 2 }, { date: '2026-03-01', value: 3 }] };
  assert.equal(valueAt(series, '2026-02-15').value, 2);
  assert.equal(valueAt(series, '2025-12-01'), null);
  assert.equal(valueAt(null, '2026-01-01'), null);
  assert.equal(pointsUntil(series, '2026-02-01').length, 2);
  assert.deepEqual(dataMonths({ series: { a: series } }), ['2026-01-01', '2026-02-01', '2026-03-01']);
});

test('dashboardFromNode builds a dashboard from an objective and everything under it', () => {
  const s = strategy();
  const objective = Object.values(s.nodes).find((n) => n.type === 'objective' && n.measures.some((m) => m.id === 'm-reach'));
  const dash = dashboardFromNode(s, objective.id);
  const measures = measuresUnder(s, objective.id);
  assert.ok(measures.length > objective.measures.length, 'includes measures on goals below');
  assert.equal(dash.sourceNodeId, objective.id);
  assert.equal(dash.visibility, 'private', 'new dashboards start private');
  assert.equal(dash.widgets.filter((w) => w.type === 'kpi').length, measures.length);
  assert.equal(dash.widgets.filter((w) => w.type === 'line').length, measures.length);
  assert.ok(dash.widgets.some((w) => w.type === 'progress'));
  for (const w of dash.widgets) assert.ok(WIDGET_TYPES.some((t) => t.id === w.type));
  assert.equal(new Set(dash.widgets.map((w) => w.id)).size, dash.widgets.length, 'widget ids are unique');
});

test('the example public dashboard plays through the months of its data', () => {
  const s = strategy();
  const { dashboards } = seedDashboards(s);
  const dash = dashboards['dash-equity'];
  assert.equal(dash.visibility, 'public');
  assert.ok(seedOrg().sites[dash.siteId], 'its site exists');
  const months = dashboardMonths(dash, seedData());
  assert.ok(months.length >= 12);
  assert.deepEqual(months, [...months].sort());
});

test('statusAt replays a task’s status history', () => {
  const task = { status: 'done', events: [
    { kind: 'status', date: '2026-09-01', text: 'active' },
    { kind: 'note', date: '2026-09-10', text: 'note' },
    { kind: 'status', date: '2026-09-29', text: 'done' },
  ] };
  assert.equal(statusAt(task, '2026-08-01', '2026-10-24'), 'planned');
  assert.equal(statusAt(task, '2026-09-15', '2026-10-24'), 'active');
  assert.equal(statusAt(task, '2026-10-01', '2026-10-24'), 'done');
  assert.equal(statusAt({ status: 'blocked', events: [] }, '2026-11-01', '2026-10-24'), 'blocked');
});

test('assets resolve against the map, org and strategy, and survive deletion', () => {
  const docs = { map: seedMap(), org: seedOrg(), strategy: strategy() };
  const used = Object.values(docs.strategy.nodes).flatMap((n) => n.assets ?? []);
  assert.ok(used.length >= 10);
  for (const a of used) {
    assert.ok(ASSET_KINDS.some((k) => k.id === a.kind), a.kind);
    assert.equal(resolveAsset(a, docs).missing, undefined, `${a.label} resolves`);
  }
  const actor = used.find((a) => a.kind === 'actor');
  docs.map.actors[actor.ref].label = 'Renamed';
  assert.equal(resolveAsset(actor, docs).label, 'Renamed');
  delete docs.map.actors[actor.ref];
  const gone = resolveAsset(actor, docs);
  assert.equal(gone.missing, true);
  assert.equal(gone.label, actor.label, 'falls back to the saved label');
});

test('assets roll up from tasks to their workplan and beyond', () => {
  const s = strategy();
  const task = find(s, 'Co-design sessions with Indigenous partners');
  const wp = s.nodes[task.parentId];
  const inWp = assetsInWorkplan(s, wp.id);
  assert.ok(inWp.some((u) => u.from.id === task.id));
  const goal = s.nodes[wp.parentId];
  assert.ok(assetsUnder(s, goal.id).length >= inWp.length);
  // The same staff member used in two tasks shows once, with both tasks.
  const sibling = Object.values(s.nodes).find((n) => n.parentId === wp.id && n.id !== task.id && n.type === 'task');
  sibling.assets.push({ id: 'x', kind: 'staff', ref: 's-indig', label: 'Tanis Cardinal' });
  const grouped = groupAssets(assetsInWorkplan(s, wp.id));
  const tanis = grouped.find((g) => assetKey(g.asset) === 'staff:s-indig');
  assert.equal(tanis.from.length, 2);
});

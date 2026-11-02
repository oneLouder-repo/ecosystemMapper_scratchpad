import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFormula, evaluate, formulaStore, formulaText } from '../src/core/formula.js';
import { calcSeries, monthRange } from '../src/platform/data.js';

const run = (text, values, at = values.a?.length - 1 ?? 0) => {
  const { tree } = parseFormula(text, (n) => n.toLowerCase());
  return evaluate(tree, at, (id, i) => values[id]?.[i] ?? null);
};

test('formulas do arithmetic in the usual order, with brackets and percentages', () => {
  assert.equal(run('1 + 2 * 3', {}), 7);
  assert.equal(run('(1 + 2) * 3', {}), 9);
  assert.equal(run('2 ^ 3 ^ 2', {}), 512);
  assert.equal(run('-[a] + 10', { a: [4] }), 6);
  assert.equal(run('50%', {}), 0.5);
  assert.equal(run('[a] / [b]', { a: [10], b: [0] }), null, 'dividing by zero gives no value, not Infinity');
  assert.equal(run('[a] / [b]', { a: [10], b: [null] }), null, 'a missing input gives no value');
});

test('formulas look back in time and use functions', () => {
  const v = { a: [10, 20, 30, 60] };
  assert.equal(run('[a] - prev([a])', v), 30);
  assert.equal(run('ago([a], 3)', v), 10);
  assert.equal(run('avg3([a])', v), 110 / 3);
  assert.equal(run('prev([a])', v, 0), null, 'nothing before the first month');
  assert.equal(run('round([a] / 7, 1)', v), 8.6);
  assert.equal(run('max([a], 100)', v), 100);
});

test('bad formulas say what is wrong; nothing is ever run as code', () => {
  assert.throws(() => parseFormula('[a] +', (n) => n), /ends too soon/);
  assert.throws(() => parseFormula('([a]', (n) => n), /bracket/);
  assert.throws(() => parseFormula('[nope]', () => null), /no measure called “nope”/);
  assert.throws(() => parseFormula('alert(1)', () => null), /no function called alert/);
  assert.throws(() => parseFormula('constructor.constructor("x")()', () => null), /no function|isn’t something/);
  assert.throws(() => parseFormula('a; b', () => null), /no function|isn’t something/);
});

test('formulas are stored by measure id and shown by name', () => {
  const names = { 'm-meals': 'Meals served', 'm-boxes': 'Good food boxes' };
  const resolve = (n) => Object.keys(names).find((id) => names[id].toLowerCase() === n.toLowerCase()) ?? null;
  const stored = formulaStore('[Meals served] / [good food boxes]', resolve);
  assert.equal(stored, '{m-meals} / {m-boxes}');
  assert.equal(formulaText(stored, (id) => names[id]), '[Meals served] / [Good food boxes]');
});

test('a calculated measure works out month by month, across gaps', () => {
  assert.deepEqual(monthRange('2025-11-01', '2026-02-01'), ['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
  const data = { series: {
    m: { points: [{ date: '2025-11-01', value: 100 }, { date: '2025-12-01', value: 120 }, { date: '2026-02-01', value: 150 }] },
    b: { points: [{ date: '2025-11-01', value: 10 }, { date: '2025-12-01', value: 12 }, { date: '2026-01-01', value: 13 }, { date: '2026-02-01', value: 15 }] },
  } };
  assert.deepEqual(calcSeries({ id: 'c', expr: '{m} / {b}' }, data).points.map((p) => p.value), [10, 10, 10]);
  // January has no meals figure, so February's change on last month can't be worked out.
  assert.deepEqual(calcSeries({ id: 'c', expr: '{m} - prev({m})' }, data).points, [{ date: '2025-12-01', value: 20 }]);
  assert.match(calcSeries({ id: 'c', expr: '{m} +' }, data).error, /ends too soon/);
});

test('a public dashboard publishes the calculated measures it shows, and the numbers they need, nothing else', async () => {
  const { publicDocs } = await import('../server/public.js');
  const docs = {
    org: { sites: { s: { id: 's', visibility: 'public' } }, plugins: {} },
    strategy: { nodes: { g: { id: 'g', type: 'goal', title: 'G', measures: [{ id: 'm1', name: 'Meals' }, { id: 'm2', name: 'Boxes' }, { id: 'm3', name: 'Secret' }] } } },
    data: { series: { m1: { points: [] }, m2: { points: [] }, m3: { points: [] } }, calcs: { c1: { id: 'c1', name: 'Meals per box', expr: '{m1} / {m2}' }, c2: { id: 'c2', name: 'Other', expr: '{m3}' } } },
    dashboards: { dashboards: { d: { id: 'd', visibility: 'public', siteId: 's', widgets: [{ id: 'w', type: 'compare', measureIds: ['c1'] }] } } },
  };
  const out = publicDocs(docs);
  assert.deepEqual(Object.keys(out.data.calcs), ['c1']);
  assert.deepEqual(Object.keys(out.data.series).sort(), ['m1', 'm2']);
});

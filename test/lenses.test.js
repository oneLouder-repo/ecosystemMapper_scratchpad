import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LENS_FILES, prepareLens, project, unproject, regionAt, columnAt } from '../src/lenses/index.js';

const read = async (name) => JSON.parse(await readFile(new URL(`../src/lenses/${name}.json`, import.meta.url)));
const taxonomy = await read('taxonomy');
const lenses = Object.fromEntries(await Promise.all(LENS_FILES.map(async (n) => [n, prepareLens(await read(n), taxonomy)])));

test('every lens covers the whole depth scale with no gaps', () => {
  for (const lens of Object.values(lenses)) {
    const ranges = [...lens.regions].map((r) => r.depth).sort((a, b) => a[0] - b[0]);
    assert.equal(ranges[0][0], 0, lens.id);
    assert.equal(ranges.at(-1)[1], 1, lens.id);
    for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i][0], ranges[i - 1][1], lens.id);
  }
});

test('project and unproject round-trip in every lens', () => {
  const places = [
    { depth: 0.1, spread: -0.4 },
    { depth: 0.5, spread: 0.2 },
    { depth: 0.8, spread: 0.6 },
  ];
  for (const lens of Object.values(lenses)) {
    for (const place of places) {
      const { x, y } = project(lens, place);
      const back = unproject(lens, x, y);
      assert.ok(Math.abs(back.depth - place.depth) < 1e-6, `${lens.id} depth`);
      assert.ok(Math.abs(back.spread - place.spread) < 1e-6, `${lens.id} spread`);
    }
  }
});

test('ordinality lines regions up across lenses', () => {
  const deep = { depth: 0.85, spread: 0 };
  assert.equal(regionAt(lenses['micro-meso-macro'], deep).id, 'micro');
  assert.equal(regionAt(lenses['water-of-systems-change'], deep).id, 'transformative');
  assert.equal(regionAt(lenses['spheres-of-systems-change'], deep).id, 'behavioural');
  assert.equal(regionAt(lenses['leverage-points'], deep).id, 'lp2');
  assert.equal(regionAt(lenses['theory-of-system-change'], deep).id, 'mental-models');
  const surface = { depth: 0.1, spread: 0 };
  assert.equal(regionAt(lenses['micro-meso-macro'], surface).id, 'macro');
  assert.equal(regionAt(lenses['water-of-systems-change'], surface).id, 'structural');
});

test('points off the lens clamp onto its edge', () => {
  const rings = lenses['micro-meso-macro'];
  assert.equal(regionAt(rings, unproject(rings, 5000, 0)).id, 'macro');
  const tri = lenses['water-of-systems-change'];
  assert.equal(regionAt(tri, unproject(tri, 0, 5000)).id, 'transformative');
});

test('grid columns follow spread', () => {
  const tosc = lenses['theory-of-system-change'];
  assert.equal(columnAt(tosc, { depth: 0.5, spread: -0.9 }).id, 'adopt');
  assert.equal(columnAt(tosc, { depth: 0.5, spread: 0.9 }).id, 'respond');
});

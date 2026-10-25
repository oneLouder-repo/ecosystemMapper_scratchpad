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

test('tidy keeps every actor in its zone (and grid column), and spaces them out', async () => {
  const { tidyPlaces } = await import('../src/lenses/tidy.js');
  const { seedMap } = await import('../src/seed.js');
  const actors = Object.values(seedMap().actors).map((a) => ({ id: a.id, place: a.place, w: a.w, h: a.h }));
  for (const lens of Object.values(lenses)) {
    const places = tidyPlaces(lens, actors);
    assert.equal(Object.keys(places).length, actors.length, lens.id);
    const pts = [];
    for (const a of actors) {
      assert.equal(regionAt(lens, places[a.id]).id, regionAt(lens, a.place).id, `${lens.id}: ${a.id} stays in its zone`);
      if (lens.columns) assert.equal(columnAt(lens, places[a.id]).id, columnAt(lens, a.place).id, `${lens.id}: ${a.id} stays in its column`);
      pts.push(project(lens, places[a.id]));
    }
    let overlaps = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) if (Math.abs(pts[i].x - pts[j].x) < 150 && Math.abs(pts[i].y - pts[j].y) < 58) overlaps++;
    assert.ok(overlaps <= 3, `${lens.id}: ${overlaps} overlapping cards`);
  }
});

test('data viz lights up an actor’s connections, or a connector’s two ends', async () => {
  const { relatedTo, workByActor } = await import('../src/tools/DataVizTool.js');
  const { seedMap } = await import('../src/seed.js');
  const { seedStrategy } = await import('../src/platform/strategySeed.js');
  const map = seedMap();
  const lit = relatedTo(map, 'actor-indig-comm');
  assert.ok(lit.has('actor-actua') && lit.has('actor-indig-youth') && lit.has('actor-indig-gov'));
  assert.ok(!lit.has('actor-ised'));
  const conn = Object.values(map.connectors).find((c) => c.label === 'core funding');
  assert.deepEqual([...relatedTo(map, conn.id)].sort(), [conn.id, 'actor-actua', 'actor-ised'].sort());
  assert.ok(workByActor(seedStrategy())['actor-indig-comm']?.length > 0, 'the example strategy has work with Indigenous communities');
});

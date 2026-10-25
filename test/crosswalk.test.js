import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareLens, LENS_FILES } from '../src/lenses/index.js';
import { crosswalk } from '../src/lenses/crosswalk.js';

const lenses = new Map(LENS_FILES.map((f) => {
  const lens = prepareLens(JSON.parse(readFileSync(new URL(`../src/lenses/${f}.json`, import.meta.url))));
  return [lens.id, lens];
}));
const ids = (rs) => rs.map((r) => r.id);

test('micro, meso and macro line up with the three kinds of change in the Water of Systems Change', () => {
  const rows = crosswalk(lenses);
  assert.deepEqual(rows.map((r) => r.region.id), ['macro', 'meso', 'micro']);
  assert.deepEqual(rows.map((r) => ids(r.matches['water-of-systems-change'])), [['structural'], ['relational'], ['transformative']]);
});

test('every region of every lens falls in exactly one tier', () => {
  const rows = crosswalk(lenses);
  for (const lens of lenses.values()) {
    if (lens.id === 'micro-meso-macro') continue;
    const placed = rows.flatMap((r) => ids(r.matches[lens.id]));
    assert.deepEqual([...placed].sort(), lens.regions.map((r) => r.id).sort(), lens.id);
  }
});

test('the deepest leverage points sit with micro, the shallowest with macro', () => {
  const [macro, , micro] = crosswalk(lenses);
  assert.ok(ids(macro.matches['leverage-points']).includes('lp12'));
  assert.ok(ids(micro.matches['leverage-points']).includes('lp1'));
  assert.ok(ids(micro.matches['leverage-points']).includes('lp2'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareLens, regionAt } from '../src/lenses/index.js';

const load = async (name) =>
  prepareLens(JSON.parse(await readFile(new URL(`../src/lenses/${name}.json`, import.meta.url))));

test('rings lens finds regions by distance from the centre', async () => {
  const lens = await load('micro-meso-macro');
  assert.equal(regionAt(lens, 0, 0).id, 'micro');
  assert.equal(regionAt(lens, 300, 0).id, 'meso');
  assert.equal(regionAt(lens, 0, -600).id, 'macro');
  assert.equal(regionAt(lens, 900, 0), null);
});

test('triangle lens finds regions by height and is empty outside the triangle', async () => {
  const lens = await load('water-of-systems-change');
  assert.equal(regionAt(lens, 0, -500).id, 'structural');
  assert.equal(regionAt(lens, 0, 0).id, 'relational');
  assert.equal(regionAt(lens, 0, 500).id, 'transformative');
  assert.equal(regionAt(lens, 700, 500), null);
  assert.equal(regionAt(lens, 0, -900), null);
});

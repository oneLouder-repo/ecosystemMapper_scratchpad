import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedStudio, mergeStudio, sendToPlan, plansOf, canWire, blankStudio, bringInPlan, migrateStudio, quadrantAt, borderFor, freeSpot, studioOps } from '../src/platform/studio.js';
import { seedStrategy } from '../src/platform/strategySeed.js';
import { migrateStrategy, childrenOf } from '../src/platform/strategy.js';
import { applyCollectionOp, col } from '../src/core/collections.js';
import { settle } from '../src/studio/Results.js';

const strategy = () => migrateStrategy(seedStrategy());

test('the example studio plans the long-range plan, with a SOAR in every quadrant', () => {
  const s = strategy();
  const doc = seedStudio(s, { staff: ['s-ed', 's-eval'] });
  const [planId] = Object.keys(doc.plans);
  assert.equal(s.nodes[planId].type, 'plan');
  assert.match(s.nodes[planId].title, /2026/);
  for (const q of ['s', 'o', 'a', 'r']) assert.ok(Object.values(doc.cards).some((c) => c.quadrant === q), q);
  assert.ok(Object.values(doc.wires).every((w) => canWire(doc.blocks[w.from], doc.blocks[w.to])), 'every example wire is allowed');
  assert.deepEqual(plansOf(s).map((p) => p.depth), [0, 1]);
});

test('merging keeps the newer of each card, and deletions stick', () => {
  const base = blankStudio();
  base.cards.a = { id: 'a', text: 'old', at: 1 };
  base.cards.b = { id: 'b', text: 'mine', at: 1 };
  const theirs = structuredClone(base);
  theirs.cards.a = { id: 'a', text: 'new', at: 5 };
  theirs.cards.c = { id: 'c', text: 'theirs', at: 3 };
  delete theirs.cards.b;
  theirs.gone.b = 4;
  const mine = structuredClone(base);
  mine.cards.d = { id: 'd', text: 'also mine', at: 6 };
  const out = mergeStudio(mine, theirs);
  assert.equal(out.cards.a.text, 'new');
  assert.equal(out.cards.b, undefined, 'their delete wins over an older card');
  assert.equal(out.cards.c.text, 'theirs');
  assert.equal(out.cards.d.text, 'also mine');
  // A card changed after someone deleted it comes back.
  mine.cards.b = { id: 'b', text: 'edited later', at: 9 };
  assert.equal(mergeStudio(mine, theirs).cards.b.text, 'edited later');
  assert.deepEqual(mergeStudio(out, out), out, 'merging is stable');
});

test('send to plan makes objectives and goals, then updates them', () => {
  const s = strategy();
  const doc = seedStudio(s, { staff: [] });
  const [planId] = Object.keys(doc.plans);
  const first = sendToPlan(doc, s, planId);
  assert.equal(first.loose, 0);
  // The example objective and one goal are already in the plan, so they update; the co-design goal is new.
  assert.equal(first.updated, 2);
  assert.equal(first.made, 1);
  applyCollectionOp(s, col.batch(first.strategyOps));
  applyCollectionOp(doc, col.batch(first.studioOps));
  const goals = childrenOf(s, 'obj-equity').map((n) => n.title);
  assert.ok(goals.includes('Co-design programs with Indigenous partners'));
  const coDesign = childrenOf(s, 'obj-equity').find((n) => n.title.startsWith('Co-design'));
  assert.match(coDesign.notes, /Opportunities: Indigenous-led programs/);
  assert.equal(childrenOf(s, 'obj-equity').filter((n) => /girls/i.test(n.title)).length, 1, 'the goal already in the plan isn’t duplicated');
  const again = sendToPlan(doc, s, planId);
  assert.equal(again.made, 0, 'sending again updates rather than duplicates');
  assert.equal(again.updated, 3);
});

test('results that land on others push them down the grid', () => {
  const cards = [{ id: 'a', x: 0, y: 0, w: 4, h: 3 }, { id: 'b', x: 2, y: 2, w: 4, h: 3 }, { id: 'c', x: 2, y: 5, w: 4, h: 2 }];
  assert.deepEqual(settle(cards, 'a'), [['b', { y: 3 }], ['c', { y: 6 }]]);
});

test('the SOAR canvas: quadrant by side, thicker borders nearer the centre, old cards moved onto it', () => {
  assert.deepEqual([quadrantAt(-5, -5), quadrantAt(5, -5), quadrantAt(-5, 5), quadrantAt(5, 5)], ['s', 'o', 'a', 'r']);
  assert.equal(borderFor({ wx: 100, wy: 80 }), 5);
  assert.equal(borderFor({ wx: 2000, wy: 2000 }), 1);
  assert.ok(borderFor({ wx: 400, wy: 300 }) < 5 && borderFor({ wx: 400, wy: 300 }) > borderFor({ wx: 800, wy: 600 }));
  const old = blankStudio();
  old.cards.a = { id: 'a', planId: 'p', quadrant: 'r', text: 'x', x: 0.2, y: 0.3, votes: [] };
  const doc = migrateStudio(old);
  assert.equal(quadrantAt(doc.cards.a.wx, doc.cards.a.wy), 'r', 'an old card stays in its quadrant');
  const spot = freeSpot(doc, 'p', 's');
  assert.equal(quadrantAt(spot.wx, spot.wy), 's');
});

test('bring in the plan lays out objectives, goals and workplans, wired, and only once', () => {
  const s = strategy();
  const doc = blankStudio();
  const [plan] = plansOf(s);
  const ops = bringInPlan(doc, s, plan.id);
  applyCollectionOp(doc, col.batch(ops));
  const blocks = Object.values(doc.blocks);
  const kinds = (k) => blocks.filter((b) => b.kind === k);
  assert.equal(kinds('plan').length, 1);
  assert.equal(kinds('objective').length, 3, 'objectives from the year-one plan under it too');
  assert.ok(kinds('workplan').length > 0, 'the example plan has workplans');
  assert.ok(Object.values(doc.wires).every((w) => canWire(doc.blocks[w.from], doc.blocks[w.to])));
  assert.equal(bringInPlan(doc, s, plan.id).length, 0, 'bringing it in again adds nothing');
  // Sending it straight back makes nothing new and moves nothing out of the year-one plan.
  const back = sendToPlan(doc, s, plan.id);
  assert.equal(back.made, 0);
  assert.ok(back.strategyOps.every((op) => op.data?.parentId === undefined && op.patch?.parentId === undefined), 'nothing is moved');
});

test('a new workplan wired into a goal is made under that goal', () => {
  const s = strategy();
  const doc = seedStudio(s, { staff: [] });
  const [planId] = Object.keys(doc.plans);
  const wp = studioOps.add('blocks', { planId, kind: 'workplan', title: 'Mentor network', ref: null, strategyId: null, x: 40, y: 600 });
  applyCollectionOp(doc, wp);
  applyCollectionOp(doc, studioOps.add('wires', { planId, from: wp.id, to: 'bl-8' }));
  const out = sendToPlan(doc, s, planId);
  applyCollectionOp(s, col.batch(out.strategyOps));
  applyCollectionOp(doc, col.batch(out.studioOps));
  const made = s.nodes[doc.blocks[wp.id].strategyId];
  assert.equal(made.type, 'workplan');
  assert.equal(made.title, 'Mentor network');
  assert.match(s.nodes[made.parentId].title, /^Co-design/);
});

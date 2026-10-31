/**
 * Planning Studio: the workshop where a strategic plan is worked out,
 * before (and alongside) its objectives and goals in Strategy & Work.
 * The framework and its plans live in the strategy document; this one
 * holds the planning around each plan:
 *
 * { id: 'studio',
 *   plans:   { [planId]: { id, team: [{ staffId, role }], notes } }        planId is a strategy plan node
 *   context: { [id]: { id, planId, kind, text, at } }                      the plan's operating context
 *   cards:   { [id]: { id, planId, quadrant: 's'|'o'|'a'|'r', text, detail, wx, wy, by, votes: [staffId], assets: [Asset], at } }
 *            wx, wy: where the card sits on the SOAR canvas, from its centre 0,0. The quadrant follows
 *            from the side it is on (S top left, O top right, A bottom left, R bottom right); nearer
 *            the centre means more important.
 *   results: { [id]: { id, planId, title, indicator, baseline, target, unit, source, frequency, measureId, cardId, x, y, w, h, at } }
 *   blocks:  { [id]: { id, planId, kind: 'card'|'asset'|'context'|'result'|'workplan'|'goal'|'objective'|'plan', ref, title, x, y, strategyId, at } }
 *   wires:   { [id]: { id, planId, from, to, at } }
 *   gone:    { [id]: at }                                                  deleted items, so a merge doesn't bring them back
 * }
 *
 * Several people can work in a plan at once. Every item carries `at`, the
 * time it last changed; when someone else's save arrives, mergeStudio keeps
 * the newer of each item, so people only overwrite each other when they
 * change the very same card at the same moment.
 */
import { uid } from '../core/ops.js';
import { col } from '../core/collections.js';
import { strategyOps, childrenOf, descendants } from './strategy.js';

export const COLLECTIONS = ['plans', 'context', 'cards', 'results', 'blocks', 'wires'];

export const QUADRANTS = [
  { id: 's', label: 'Strengths', ask: 'What are we best at? What do we do that others value?', color: '#2a7d5f' },
  { id: 'o', label: 'Opportunities', ask: 'What could we take up? What are partners and the world asking of us?', color: '#2a78d6' },
  { id: 'a', label: 'Aspirations', ask: 'What do we care most about? What future do we want to create?', color: '#7b4fc9' },
  { id: 'r', label: 'Results', ask: 'How will we know we have got there? What would we measure?', color: '#c4622d' },
];
export const quadrant = (id) => QUADRANTS.find((q) => q.id === id);

export const CONTEXT_KINDS = [
  { id: 'political', label: 'Political' },
  { id: 'economic', label: 'Economic' },
  { id: 'social', label: 'Social' },
  { id: 'technology', label: 'Technology' },
  { id: 'environment', label: 'Environment' },
  { id: 'legal', label: 'Legal' },
  { id: 'internal', label: 'Inside the organisation' },
];

export const TEAM_ROLES = [
  { id: 'facilitator', label: 'Facilitator' },
  { id: 'lead', label: 'Plan lead' },
  { id: 'member', label: 'Member' },
  { id: 'advisor', label: 'Advisor' },
];

export const blankStudio = () => ({ id: 'studio', plans: {}, context: {}, cards: {}, results: {}, blocks: {}, wires: {}, gone: {} });

export function migrateStudio(doc) {
  for (const k of [...COLLECTIONS, 'gone']) doc[k] ??= {};
  // Cards from the first SOAR board sat at a share of a fixed quadrant; put them on the open canvas.
  for (const c of Object.values(doc.cards)) {
    if (c.wx != null) continue;
    const left = c.quadrant === 's' || c.quadrant === 'a';
    const top = c.quadrant === 's' || c.quadrant === 'o';
    const x = (c.x ?? 0.3) * QUADRANT_SIZE + CARD_SIZE.w / 2;
    const y = (c.y ?? 0.3) * QUADRANT_SIZE + CARD_SIZE.h / 2;
    c.wx = Math.round(left ? x - QUADRANT_SIZE : x);
    c.wy = Math.round(top ? y - QUADRANT_SIZE : y);
  }
  return doc;
}

/** The SOAR canvas: a quadrant's usual reach, and a card's size, in canvas units. */
export const QUADRANT_SIZE = 1000;
export const CARD_SIZE = { w: 200, h: 110 };

/** Which quadrant a point on the SOAR canvas is in. */
export const quadrantAt = (wx, wy) => (wy < 0 ? (wx < 0 ? 's' : 'o') : (wx < 0 ? 'a' : 'r'));

/** How important a card reads, from 0 (far out) to 1 (at the centre). */
export const closeness = (c) => Math.max(0, Math.min(1, 1 - (Math.hypot(c.wx, c.wy) - 160) / 1000));
/** Its border: 5px at the centre, thinning to 1px far out. */
export const borderFor = (c) => Math.round((1 + 4 * closeness(c)) * 2) / 2;

/** Ops that stamp the time, so merges know which change is newer. */
export const studioOps = {
  add: (collection, data) => col.add(collection, { id: uid(collection.replace(/s$/, '')), ...data, at: Date.now() }),
  update: (collection, id, patch) => col.update(collection, id, { ...patch, at: Date.now() }),
  remove: (doc, collection, ids) => col.batch([
    ...[ids].flat().filter((id) => doc[collection][id]).map((id) => col.remove(collection, id)),
    col.set('gone', { ...doc.gone, ...Object.fromEntries([ids].flat().map((id) => [id, Date.now()])) }),
  ]),
};

/** Everything in one collection that belongs to a plan. */
export const ofPlan = (doc, collection, planId) => Object.values(doc[collection] ?? {}).filter((x) => x.planId === planId);

/**
 * Merge someone else's saved studio into ours: the newer of each item
 * wins, and deletions stick unless the item changed after it was deleted.
 */
export function mergeStudio(mine, theirs) {
  const out = blankStudio();
  out.id = mine.id ?? theirs.id ?? 'studio';
  for (const [id, at] of [...Object.entries(mine.gone ?? {}), ...Object.entries(theirs.gone ?? {})]) out.gone[id] = Math.max(out.gone[id] ?? 0, at);
  for (const k of COLLECTIONS) {
    const ids = new Set([...Object.keys(mine[k] ?? {}), ...Object.keys(theirs[k] ?? {})]);
    for (const id of ids) {
      const a = mine[k]?.[id];
      const b = theirs[k]?.[id];
      const pick = !a ? b : !b ? a : (b.at ?? 0) > (a.at ?? 0) ? b : a;
      if (out.gone[id] && out.gone[id] >= (pick.at ?? 0)) continue;
      out[k][id] = structuredClone(pick);
    }
  }
  return out;
}

/** The strategy plans the Studio can work on, outermost first. */
export function plansOf(strategy) {
  const out = [];
  const walk = (parentId, depth) => {
    for (const n of childrenOf(strategy, parentId)) {
      if (n.type !== 'plan') continue;
      out.push({ ...n, depth });
      walk(n.id, depth + 1);
    }
  };
  for (const root of Object.values(strategy.nodes).filter((n) => !n.parentId)) walk(root.id, 0);
  return out;
}

/** What a block on the Assemble canvas shows, looked up from what it points at. */
export function blockLabel(doc, block) {
  if (block.kind === 'card') return doc.cards[block.ref]?.text ?? '(removed)';
  if (block.kind === 'context') return doc.context[block.ref]?.text ?? '(removed)';
  if (block.kind === 'result') return doc.results[block.ref]?.title ?? '(removed)';
  return block.title ?? '';
}

/** Can a wire go from one block to another? Ideas feed goals; goals feed objectives. */
export function canWire(from, to) {
  if (!from || !to || from.id === to.id) return false;
  if (to.kind === 'goal') return ['card', 'asset', 'context', 'result', 'workplan'].includes(from.kind);
  if (to.kind === 'objective') return ['card', 'asset', 'context', 'result', 'goal'].includes(from.kind);
  if (to.kind === 'plan') return from.kind === 'objective';
  return false;
}

/**
 * Turn the Assemble canvas into strategy ops: every objective block
 * becomes (or updates) an objective under the plan, every goal wired into
 * it a goal under that objective. A result wired in becomes a measure.
 * Returns { strategyOps: [op], studioOps: [op], made, updated, loose }.
 */
export function sendToPlan(doc, strategy, planId) {
  const blocks = ofPlan(doc, 'blocks', planId);
  const wires = ofPlan(doc, 'wires', planId);
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  const into = (id) => wires.filter((w) => w.to === id).map((w) => byId[w.from]).filter(Boolean);
  const sOps = [];
  const tOps = [];
  let made = 0;
  let updated = 0;
  const notesFor = (b) => {
    const feeds = into(b.id).filter((x) => x.kind !== 'goal' && x.kind !== 'result');
    if (!feeds.length) return undefined;
    return `From the Planning Studio, building on:\n${feeds.map((x) => `- ${x.kind === 'card' ? `${quadrant(doc.cards[x.ref]?.quadrant)?.label}: ` : x.kind === 'context' ? 'Context: ' : 'Asset: '}${blockLabel(doc, x)}`).join('\n')}`;
  };
  const measuresFor = (b, node) => {
    const have = node?.measures ?? [];
    const add = into(b.id).filter((x) => x.kind === 'result').map((x) => doc.results[x.ref]).filter(Boolean)
      .filter((r) => !have.some((m) => m.id === (r.measureId || `m-${r.id}`)))
      .map((r) => ({ id: r.measureId || `m-${r.id}`, name: r.indicator || r.title, target: r.target ?? '', unit: r.unit ?? '' }));
    return add.length ? [...have, ...add] : null;
  };
  // Work on a copy so new objectives can take goals in the same pass.
  const nodes = { ...strategy.nodes };
  const place = (b, type, parentId) => {
    const existing = b.strategyId && nodes[b.strategyId];
    const notes = notesFor(b);
    if (existing) {
      const patch = { title: b.title };
      // Move it only if it isn't already somewhere under its new parent (an objective in a sub-plan stays there).
      if (parentId && !isUnder(nodes, existing.id, parentId)) patch.parentId = parentId;
      if (notes && !existing.notes) patch.notes = notes;
      const measures = measuresFor(b, existing);
      if (measures) patch.measures = measures;
      sOps.push(strategyOps.update(existing.id, patch));
      updated++;
      return existing.id;
    }
    const op = strategyOps.addNode({ nodes }, { type, parentId, title: b.title, ...(notes ? { notes } : {}) });
    const measures = measuresFor(b, null);
    if (measures) op.data.measures = measures;
    nodes[op.id] = { ...op.data, id: op.id };
    sOps.push(op);
    tOps.push(studioOps.update('blocks', b.id, { strategyId: op.id }));
    made++;
    return op.id;
  };
  for (const pb of blocks.filter((b) => b.kind === 'plan' && b.strategyId === planId && nodes[planId])) {
    if (pb.title && pb.title !== nodes[planId].title) { sOps.push(strategyOps.update(planId, { title: pb.title })); updated++; }
  }
  for (const ob of blocks.filter((b) => b.kind === 'objective')) {
    const objId = place(ob, 'objective', planId);
    for (const g of into(ob.id).filter((x) => x.kind === 'goal')) {
      const goalId = place(g, 'goal', objId);
      for (const w of into(g.id).filter((x) => x.kind === 'workplan')) place(w, 'workplan', goalId);
    }
  }
  const loose = blocks.filter((b) => b.kind === 'goal' && !wires.some((w) => w.from === b.id && byId[w.to]?.kind === 'objective')).length;
  return { strategyOps: sOps, studioOps: tOps, made, updated, loose };
}

const isUnder = (nodes, id, ancestorId) => {
  for (let n = nodes[id]; n?.parentId; n = nodes[n.parentId]) if (n.parentId === ancestorId) return true;
  return false;
};

/** The example org's planning for its long-range plan: a SOAR in progress. */
export function seedStudio(strategy, { staff = [] } = {}) {
  const doc = blankStudio();
  const plan = plansOf(strategy).find((p) => /2026/.test(p.title)) ?? plansOf(strategy)[0];
  if (!plan) return doc;
  const planId = plan.id;
  const at = 1;
  const who = (i) => staff[i % Math.max(1, staff.length)] ?? null;
  doc.plans[planId] = { id: planId, at, notes: 'Two online sessions in March, then a board retreat. Tanis and Mateo co-facilitate.',
    team: [['s-indig', 'facilitator'], ['s-eval', 'facilitator'], ['s-ed', 'lead'], ['s-prog', 'member'], ['s-part', 'member'], ['s-fin', 'advisor']]
      .filter(([id]) => !staff.length || staff.includes(id)).map(([staffId, role]) => ({ staffId, role })) };
  const ctx = [
    ['political', 'Federal youth STEM funding is up for renewal in 2027.'],
    ['social', 'Families in rural and northern communities say programs feel built for cities.'],
    ['economic', 'Corporate sponsorship is steady but tied to short campaigns.'],
    ['technology', 'Members collect data in five different systems.'],
    ['internal', 'A small national office (12 staff) serving 40 member programs.'],
  ];
  ctx.forEach(([kind, text], i) => { doc.context[`cx-${i + 1}`] = { id: `cx-${i + 1}`, planId, kind, text, at }; });
  const cards = {
    s: ['Trusted by universities and colleges in every province', 'Hands-on programs young people love', 'Instructors who reflect the youth they serve', 'Shared data across 40 member programs'],
    o: ['Indigenous-led programs asking for partners', 'Provinces revising science curricula', 'Funders want shared outcomes, not one-off reports'],
    a: ['Every young person can see themselves in STEM', 'A network that bends to serve youth furthest from opportunity', 'Learning in public with our data'],
    r: ['Half a million youth a year, most from equity-deserving groups', 'Girls and gender-diverse youth at half of participants', 'Every program reporting the same core indicators'],
  };
  for (const [q, list] of Object.entries(cards)) list.forEach((text, i) => {
    const id = `card-${q}${i + 1}`;
    // Spread out from the centre: the first (most important) cards closest in.
    const r = 280 + i * 210;
    const angle = ((18 + ((i * 29) % 54)) * Math.PI) / 180;
    const [sx, sy] = [q === 's' || q === 'a' ? -1 : 1, q === 's' || q === 'o' ? -1 : 1];
    doc.cards[id] = { id, planId, quadrant: q, text, detail: '', wx: Math.round(sx * r * Math.cos(angle)), wy: Math.round(sy * r * Math.sin(angle)), by: who(i), votes: staff.slice(0, (5 - i) % 4), assets: [], at };
  });
  doc.cards['card-s1'].assets = [{ id: 'as-seed-1', kind: 'actor', mapId: 'map-ecosystem', ref: 'actor-universities', label: 'University & college partners' }];
  doc.cards['card-o1'].assets = [{ id: 'as-seed-2', kind: 'actor', mapId: 'map-ecosystem', ref: 'actor-indig-comm', label: 'Indigenous communities' }];
  const results = [
    ['res-1', 'card-r1', 'More young people reached, mostly from equity-deserving groups', 'Youth reached in a year', '312000', '500000', 'youth / yr', 'Member program registrations', 'Monthly', 'm-reach', 0, 0],
    ['res-2', 'card-r2', 'Gender parity in our programs', 'Girls & gender-diverse participants', '38', '50', '%', 'Registration survey', 'Quarterly', 'm-girls', 4, 0],
    ['res-3', 'card-r3', 'One MEL framework across all programs', 'Programs reporting core indicators', '30', '100', '%', 'Data platform', 'Quarterly', 'm-reporting', 8, 0],
  ];
  for (const [id, cardId, title, indicator, baseline, target, unit, source, frequency, measureId, x, y] of results)
    doc.results[id] = { id, planId, cardId, title, indicator, baseline, target, unit, source, frequency, measureId, x, y, w: 4, h: 5, at };
  const equity = strategy.nodes['obj-equity'] ? 'obj-equity' : null;
  const blocks = [
    ['bl-1', 'card', 'card-s3', 40, 40], ['bl-2', 'card', 'card-a2', 40, 150], ['bl-3', 'context', 'cx-2', 40, 260], ['bl-4', 'result', 'res-2', 40, 370],
    ['bl-5', 'goal', null, 380, 120, 'Programs reach more girls and gender-diverse youth', Object.values(strategy.nodes).find((n) => n.type === 'goal' && /girls/i.test(n.title))?.id],
    ['bl-6', 'objective', null, 720, 200, 'Deepen equity and inclusion in every program', equity],
    ['bl-7', 'card', 'card-o1', 40, 480], ['bl-8', 'goal', null, 380, 420, 'Co-design programs with Indigenous partners'],
  ];
  for (const [id, kind, ref, x, y, title, strategyId] of blocks) doc.blocks[id] = { id, planId, kind, ref, x, y, title: title ?? null, strategyId: strategyId ?? null, at };
  [['bl-1', 'bl-5'], ['bl-2', 'bl-5'], ['bl-3', 'bl-5'], ['bl-4', 'bl-5'], ['bl-5', 'bl-6'], ['bl-7', 'bl-8'], ['bl-8', 'bl-6']]
    .forEach(([from, to], i) => { doc.wires[`wi-${i + 1}`] = { id: `wi-${i + 1}`, planId, from, to, at }; });
  return doc;
}

/**
 * Put the plan as it stands in Strategy & Work onto the Assemble canvas:
 * the plan, its objectives, their goals and the goals' workplans, wired
 * together, leaving out anything already there. Returns studio ops.
 */
export function bringInPlan(doc, strategy, planId) {
  const blocks = ofPlan(doc, 'blocks', planId);
  const onCanvas = Object.fromEntries(blocks.filter((b) => b.strategyId).map((b) => [b.strategyId, b.id]));
  const wired = new Set(ofPlan(doc, 'wires', planId).map((w) => `${w.from}>${w.to}`));
  const top = blocks.reduce((m, b) => Math.max(m, b.y + 130), 30);
  const ops = [];
  const rows = { workplan: top, goal: top, objective: top, plan: top };
  const X = { workplan: 40, goal: 400, objective: 760, plan: 1120 };
  const put = (n, kind) => {
    if (onCanvas[n.id]) return onCanvas[n.id];
    const op = studioOps.add('blocks', { planId, kind, ref: null, title: n.title, strategyId: n.id, x: X[kind], y: rows[kind] });
    rows[kind] += kind === 'workplan' ? 135 : 125;
    ops.push(op);
    onCanvas[n.id] = op.id;
    return op.id;
  };
  const wire = (from, to) => {
    if (wired.has(`${from}>${to}`)) return;
    wired.add(`${from}>${to}`);
    ops.push(studioOps.add('wires', { planId, from, to }));
  };
  const plan = strategy.nodes[planId];
  if (!plan) return ops;
  const planBlock = put(plan, 'plan');
  // Objectives in sub-plans (a year-one plan under a five-year plan) count as the plan's too.
  for (const o of descendants(strategy, planId).filter((n) => n.type === 'objective')) {
    const ob = put(o, 'objective');
    wire(ob, planBlock);
    for (const g of childrenOf(strategy, o.id).filter((n) => n.type === 'goal')) {
      rows.goal = Math.max(rows.goal, rows.workplan);
      const gb = put(g, 'goal');
      wire(gb, ob);
      for (const w of childrenOf(strategy, g.id).filter((n) => n.type === 'workplan')) wire(put(w, 'workplan'), gb);
    }
    rows.objective = Math.max(rows.objective, rows.goal);
  }
  return ops;
}

/** A free spot for a new card in a quadrant of the SOAR canvas, as near the centre as there's room. */
export function freeSpot(doc, planId, q, near = null) {
  const cards = ofPlan(doc, 'cards', planId);
  const [sx, sy] = [q === 's' || q === 'a' ? -1 : 1, q === 's' || q === 'o' ? -1 : 1];
  const fits = (x, y) => quadrantAt(x, y) === q && Math.abs(x) > CARD_SIZE.w / 2 + 10 && Math.abs(y) > CARD_SIZE.h / 2 + 10
    && cards.every((c) => Math.abs(c.wx - x) > CARD_SIZE.w + 16 || Math.abs(c.wy - y) > CARD_SIZE.h + 16);
  const start = near ?? { x: sx * 420, y: sy * 320 };
  for (let i = 0; i < 600; i++) {
    const r = i * 9;
    const t = i * 0.5;
    const x = Math.round(start.x + r * Math.cos(t));
    const y = Math.round(start.y + r * Math.sin(t) * 0.7);
    if (fits(x, y)) return { wx: x, wy: y };
  }
  return { wx: start.x, wy: start.y };
}

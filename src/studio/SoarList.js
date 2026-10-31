import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openAssetChooser } from '../ui/AssetChooser.js';
import { assetTile } from '../strategy/Assets.js';
import { QUADRANTS, quadrant, ofPlan, freeSpot } from '../platform/studio.js';

/**
 * Strengths, Opportunities or Aspirations as a list: the same cards as on
 * the SOAR board, most dotted first, with room to say more and to link
 * the assets behind each one (actors on the map, staff, documents…) using
 * the asset chooser the other plugins use.
 */
const PROMPTS = {
  s: 'Name what the organisation does well, then link the people, partners and resources behind it.',
  o: 'Name what the world is offering or asking, and who is involved: partners on the map, funders, documents.',
  a: 'Name the future people want. These become the plan’s objectives on the Assemble canvas.',
};

export function SoarList(ctx, plan, tab) {
  const q = quadrant(tab);
  const cards = ofPlan(ctx.doc, 'cards', plan.id).filter((c) => c.quadrant === tab).sort((a, b) => b.votes.length - a.votes.length || (a.at ?? 0) - (b.at ?? 0));
  const onCanvas = new Set(ofPlan(ctx.doc, 'blocks', plan.id).filter((b) => b.kind === 'card').map((b) => b.ref));
  const text = h('input', { class: 'input input-sm', name: `new-${tab}`, placeholder: `A new ${q.label.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '')}…`, 'aria-label': `New ${q.label}` });
  const add = (e) => {
    e.preventDefault();
    if (!text.value.trim()) return;
    ctx.add('cards', { planId: plan.id, quadrant: tab, text: text.value.trim(), detail: '', ...freeSpot(ctx.doc, plan.id, tab), by: ctx.me?.id ?? null, votes: [], assets: [] });
  };
  const toCanvas = (c) => {
    const n = ofPlan(ctx.doc, 'blocks', plan.id).length;
    ctx.add('blocks', { planId: plan.id, kind: 'card', ref: c.id, x: 40, y: 40 + (n % 8) * 100, title: null, strategyId: null });
  };

  return h('div', { class: 'soar-list', style: `--q:${q.color}` },
    h('div', { class: 'soar-list-intro' },
      h('span', { class: 'soar-letter big', 'aria-hidden': 'true' }, q.label[0]),
      h('div', {}, h('h2', {}, q.label), h('p', { class: 'muted' }, q.ask, ' ', PROMPTS[tab]))),
    h('form', { class: 'join soar-add', onsubmit: add }, text, h('button', { class: 'btn btn-sm btn-primary join-item', type: 'submit' }, icon('plus', 14), 'Add')),
    !cards.length && h('p', { class: 'empty' }, `No ${q.label.toLowerCase()} yet. Add some here or on the SOAR board.`),
    h('ol', { class: 'soar-items' }, cards.map((c) => h('li', { class: 'card card-border bg-base-100 soar-item' }, h('div', { class: 'card-body' },
      h('div', { class: 'soar-item-head' },
        h('span', { class: 'badge badge-sm', title: 'Dots from the SOAR board' }, `● ${c.votes.length}`),
        h('input', { class: 'input input-sm soar-item-text', name: `t-${c.id}`, value: c.text, 'aria-label': 'Card', onchange: (e) => ctx.put('cards', c.id, { text: e.target.value.trim() }) }),
        h('select', { class: 'select select-xs', name: `q-${c.id}`, 'aria-label': 'Move to', title: 'Move to another quadrant', onchange: (e) => ctx.put('cards', c.id, { quadrant: e.target.value, ...freeSpot(ctx.doc, plan.id, e.target.value) }) },
          options(QUADRANTS.map((x) => ({ id: x.id, label: x.label })), c.quadrant)),
        h('button', { class: 'btn btn-ghost btn-xs', disabled: onCanvas.has(c.id), title: onCanvas.has(c.id) ? 'Already on the Assemble canvas' : 'Put it on the Assemble canvas', onclick: () => toCanvas(c) }, icon('connect', 13), onCanvas.has(c.id) ? 'On canvas' : 'To canvas'),
        h('button', { class: 'btn btn-ghost btn-xs btn-square', title: 'Remove', 'aria-label': 'Remove card', onclick: () => { if (confirm('Remove this card?')) ctx.remove('cards', c.id); } }, '×')),
      h('textarea', { class: 'textarea textarea-sm', name: `d-${c.id}`, rows: 2, placeholder: 'Say more: evidence, examples, who raised it', onchange: (e) => ctx.put('cards', c.id, { detail: e.target.value }) }, c.detail ?? ''),
      h('div', { class: 'soar-assets-row' },
        h('ul', { class: 'asset-tiles' }, (c.assets ?? []).map((a) => assetTile(a, ctx.docs, { remove: () => ctx.put('cards', c.id, { assets: c.assets.filter((x) => x.id !== a.id) }) }))),
        h('button', { class: 'btn btn-xs', onclick: () => openAssetChooser({
          docs: ctx.docs, node: { title: c.text || q.label }, current: () => ctx.doc.cards[c.id]?.assets ?? [],
          onPick: (asset) => ctx.put('cards', c.id, { assets: [...(ctx.doc.cards[c.id]?.assets ?? []), asset] }),
        }) }, icon('plus', 13), 'Link an asset')))))));
}

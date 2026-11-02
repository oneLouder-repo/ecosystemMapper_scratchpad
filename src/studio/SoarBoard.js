import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { initials } from '../platform/org.js';
import { QUADRANTS, quadrant, ofPlan, quadrantAt, borderFor, freeSpot, CARD_SIZE } from '../platform/studio.js';
import { Viewport } from './Viewport.js';

/**
 * The SOAR board: one open, zoomable canvas with the four quadrants
 * meeting at its centre (S top left, O top right, A bottom left, R bottom
 * right), with room for as many cards as a session can make. The nearer a
 * card sits to the centre, the more it matters: its border goes from 5px
 * at the centre to 1px far out.
 *
 * Double-click anywhere to add a card there. Drag a card to move it (into
 * another quadrant too); drag the background to pan; Ctrl or ⌘ + scroll to
 * zoom. Everyone with the plan open sees changes as they save.
 */
const RINGS = [300, 650, 1000];

export function SoarBoard(ctx, plan) {
  const cards = ofPlan(ctx.doc, 'cards', plan.id);
  const me = ctx.me?.id ?? null;
  ctx.views ??= {};
  const add = (spot) => {
    const op = ctx.add('cards', { planId: plan.id, quadrant: quadrantAt(spot.wx, spot.wy), text: '', detail: '', ...spot, by: me, votes: [], assets: [] });
    requestAnimationFrame(() => document.querySelector(`[name="card-${op.id}"]`)?.focus({ preventScroll: true }));
  };
  /** Most dotted nearest the centre, in rings, for every quadrant. */
  const rank = () => {
    for (const q of QUADRANTS) {
      const list = cards.filter((c) => c.quadrant === q.id).sort((a, b) => b.votes.length - a.votes.length);
      const [sx, sy] = [q.id === 's' || q.id === 'a' ? -1 : 1, q.id === 's' || q.id === 'o' ? -1 : 1];
      let ring = 0;
      let slot = 0;
      for (const c of list) {
        const r = 230 + ring * 170;
        const per = Math.max(2, Math.floor((r * Math.PI) / 2 / (CARD_SIZE.w + 30)));
        const t = ((slot + 0.5) / per) * (Math.PI / 2);
        ctx.put('cards', c.id, { wx: Math.round(sx * Math.max(CARD_SIZE.w / 2 + 14, r * Math.cos(t))), wy: Math.round(sy * Math.max(CARD_SIZE.h / 2 + 14, r * Math.sin(t))) });
        if (++slot >= per) { slot = 0; ring++; }
      }
    }
  };

  const vp = Viewport(ctx.views[`soar:${plan.id}`] ??= {}, {
    home: (w, hgt) => ({ x: w / 2, y: hgt / 2, z: Math.max(0.3, Math.min(1, Math.min(w, hgt) / 1500)) }),
    buttons: [h('button', { class: 'btn btn-sm join-item', title: 'Move the most dotted cards nearest the centre', onclick: () => { if (confirm('Arrange every quadrant with the most dotted cards nearest the centre?')) rank(); } }, icon('tidy', 15), 'Rank by dots')],
  });
  const S = 6000;
  vp.world.append(
    ...QUADRANTS.map((q) => h('div', { class: 'soar-zone', 'data-pan': '', style: `--q:${q.color};${q.id === 's' || q.id === 'a' ? `left:${-S}px` : 'left:0'};${q.id === 's' || q.id === 'o' ? `top:${-S}px` : 'top:0'};width:${S}px;height:${S}px` })),
    ...RINGS.map((r, i) => h('div', { class: 'soar-ring', 'data-pan': '', style: `width:${r * 2}px;height:${r * 2}px;left:${-r}px;top:${-r}px;opacity:${1 - i * 0.25}` })),
    h('div', { class: 'soar-axis x', 'data-pan': '' }), h('div', { class: 'soar-axis y', 'data-pan': '' }),
    h('div', { class: 'soar-centre', title: 'The centre: cards here matter most' }, 'more important'),
    ...QUADRANTS.map((q) => h('div', { class: `soar-label q-${q.id}`, 'data-pan': '', style: `--q:${q.color}` },
      h('span', { class: 'soar-letter big' }, q.label[0]),
      h('div', {}, h('strong', {}, q.label), h('small', {}, q.ask)),
      h('button', { class: 'btn btn-xs', title: `Add a card to ${q.label}`, onpointerdown: (e) => e.stopPropagation(), onclick: () => add(freeSpot(ctx.doc, plan.id, q.id)) }, icon('plus', 12), 'Card'))),
    ...cards.map((c) => Card(ctx, c, me, vp)));
  vp.el.addEventListener('dblclick', (e) => {
    if (!e.target.closest('[data-pan]') && e.target !== vp.world && e.target !== vp.el) return;
    const p = vp.toWorld(e.clientX, e.clientY);
    add({ wx: Math.round(p.x), wy: Math.round(p.y) });
  });
  vp.el.classList.add('soar-canvas');

  return h('div', { class: 'soar-wrap' },
    h('p', { class: 'muted soar-help' }, 'Double-click to add a card. Drag cards to move them; nearer the centre means more important. Drag the background to pan, Ctrl or ⌘ + scroll to zoom. Click the dot to vote.'),
    vp.el);
}

function Card(ctx, c, me, vp) {
  const author = ctx.org.staff[c.by];
  const voted = me && c.votes.includes(me);
  const place = (wx, wy) => {
    el.style.left = `${wx - CARD_SIZE.w / 2}px`;
    el.style.top = `${wy - CARD_SIZE.h / 2}px`;
    el.style.setProperty('--q', quadrant(quadrantAt(wx, wy)).color);
    el.style.borderWidth = `${borderFor({ wx, wy })}px`;
  };
  const el = h('article', { class: `soar-card${c.text ? '' : ' empty'}`, 'data-id': c.id, style: `width:${CARD_SIZE.w}px;min-height:${CARD_SIZE.h}px`,
    title: 'Drag to move. Nearer the centre means more important.' },
    h('div', { class: 'soar-card-grip' },
      h('span', { class: 'soar-by', title: author ? `Added by ${author.name}` : 'Added by someone' }, initials(author?.name ?? '?')),
      c.assets?.length > 0 && h('span', { class: 'soar-assets', title: c.assets.map((a) => a.label).join(', ') }, icon('link', 11), c.assets.length),
      h('span', { class: 'spacer' }),
      h('button', { class: `soar-vote${voted ? ' on' : ''}`, title: voted ? 'Take your dot back' : 'Dot this card', 'aria-pressed': String(!!voted), disabled: !me,
        onclick: () => ctx.put('cards', c.id, { votes: voted ? c.votes.filter((v) => v !== me) : [...c.votes, me] }) },
        h('span', { class: 'dot', 'aria-hidden': 'true' }), c.votes.length || ''),
      h('button', { class: 'soar-x', title: 'Remove card', 'aria-label': 'Remove card',
        onclick: () => { if (!c.text || confirm('Remove this card?')) ctx.remove('cards', c.id); } }, '×')),
    h('textarea', { name: `card-${c.id}`, rows: 3, placeholder: 'Write here…', 'aria-label': 'Card text',
      onchange: (e) => ctx.put('cards', c.id, { text: e.target.value.trim() }) }, c.text));
  place(c.wx, c.wy);
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('textarea, button')) return;
    drag(ctx, el, c, e, vp, place);
  });
  return el;
}

/**
 * Move a card with the pointer, in canvas units. It only starts moving
 * once the pointer has, so a click never shifts it; it stays in its own
 * place in the canvas the whole time, so nothing jumps.
 */
function drag(ctx, el, c, e, vp, place) {
  e.preventDefault();
  const start = { x: e.clientX, y: e.clientY };
  let pos = null;
  const move = (ev) => {
    const dx = (ev.clientX - start.x) / vp.view.z;
    const dy = (ev.clientY - start.y) / vp.view.z;
    if (!pos && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
    if (!pos) { ctx.dragging = true; el.classList.add('dragging'); }
    pos = { wx: Math.round(c.wx + dx), wy: Math.round(c.wy + dy) };
    place(pos.wx, pos.wy);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (!pos) return;
    el.classList.remove('dragging');
    ctx.endDrag();
    ctx.put('cards', c.id, { ...pos, quadrant: quadrantAt(pos.wx, pos.wy) });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

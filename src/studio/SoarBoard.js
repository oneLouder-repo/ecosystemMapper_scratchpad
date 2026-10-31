import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { initials } from '../platform/org.js';
import { QUADRANTS, ofPlan } from '../platform/studio.js';

/**
 * The SOAR board: a shared whiteboard in four quadrants. Anyone in the
 * session adds sticky cards, drags them about (and between quadrants),
 * writes on them and dots the ones that matter. Double-click a quadrant to
 * add a card where you clicked.
 */
const CARD_W = 0.42; // a card's width as a share of its quadrant

export function SoarBoard(ctx, plan) {
  const cards = ofPlan(ctx.doc, 'cards', plan.id);
  const me = ctx.me?.id ?? null;
  const add = (q, x, y) => {
    const op = ctx.add('cards', { planId: plan.id, quadrant: q, text: '', detail: '', x, y, by: me, votes: [], assets: [] });
    requestAnimationFrame(() => document.querySelector(`[name="card-${op.id}"]`)?.focus());
  };
  const freeSpot = (q) => {
    const mine = cards.filter((c) => c.quadrant === q);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 2; col++) {
      const x = 0.05 + col * 0.48;
      const y = 0.1 + row * 0.2;
      if (!mine.some((c) => Math.abs(c.x - x) < 0.3 && Math.abs(c.y - y) < 0.15)) return { x, y };
    }
    return { x: 0.05 + Math.random() * 0.4, y: 0.1 + Math.random() * 0.6 };
  };
  /** Lay a quadrant's cards out in tidy rows, most dotted first. */
  const tidy = (q) => {
    const list = cards.filter((c) => c.quadrant === q).sort((a, b) => b.votes.length - a.votes.length);
    list.forEach((c, i) => ctx.put('cards', c.id, { x: 0.04 + (i % 2) * 0.48, y: 0.1 + Math.floor(i / 2) * (0.85 / Math.max(3, Math.ceil(list.length / 2))) }));
  };

  const board = h('div', { class: 'soar-board' }, QUADRANTS.map((q) => {
    const zone = h('div', { class: 'soar-q', 'data-q': q.id, style: `--q:${q.color}`,
      ondblclick: (e) => {
        if (e.target !== zone && !e.target.classList.contains('soar-q-ask')) return;
        const r = zone.getBoundingClientRect();
        add(q.id, clamp((e.clientX - r.left) / r.width - CARD_W / 2, 0, 1 - CARD_W), clamp((e.clientY - r.top) / r.height - 0.04, 0.08, 0.9));
      } },
      h('header', { class: 'soar-q-head' },
        h('span', { class: 'soar-letter', 'aria-hidden': 'true' }, q.label[0]),
        h('div', {}, h('strong', {}, q.label), h('small', { class: 'soar-q-ask' }, q.ask)),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn btn-ghost btn-xs', title: 'Lay these cards out in rows, most dotted first', onclick: () => tidy(q.id) }, icon('tidy', 14)),
        h('button', { class: 'btn btn-xs', title: `Add a card to ${q.label}`, onclick: () => { const s = freeSpot(q.id); add(q.id, s.x, s.y); } }, icon('plus', 14), 'Card')),
      cards.filter((c) => c.quadrant === q.id).map((c) => Card(ctx, c, me)));
    return zone;
  }));

  return h('div', { class: 'soar-wrap' },
    h('p', { class: 'muted soar-help' }, 'Double-click a quadrant to add a card there. Drag a card by its top strip, even into another quadrant. Click the dot to vote. Everyone with the plan open sees changes as they save.'),
    board);
}

function Card(ctx, c, me) {
  const author = ctx.org.staff[c.by];
  const voted = me && c.votes.includes(me);
  const el = h('article', { class: `soar-card${c.text ? '' : ' empty'}`, style: `left:${c.x * 100}%;top:${c.y * 100}%`, 'data-id': c.id },
    h('div', { class: 'soar-card-grip', title: 'Drag to move', onpointerdown: (e) => drag(ctx, el, c, e) },
      h('span', { class: 'soar-by', title: author ? `Added by ${author.name}` : 'Added by someone' }, initials(author?.name ?? '?')),
      c.assets?.length > 0 && h('span', { class: 'soar-assets', title: c.assets.map((a) => a.label).join(', ') }, icon('link', 11), c.assets.length),
      h('span', { class: 'spacer' }),
      h('button', { class: `soar-vote${voted ? ' on' : ''}`, title: voted ? 'Take your dot back' : 'Dot this card', 'aria-pressed': String(!!voted), disabled: !me,
        onpointerdown: (e) => e.stopPropagation(),
        onclick: () => ctx.put('cards', c.id, { votes: voted ? c.votes.filter((v) => v !== me) : [...c.votes, me] }) },
        h('span', { class: 'dot', 'aria-hidden': 'true' }), c.votes.length || ''),
      h('button', { class: 'soar-x', title: 'Remove card', 'aria-label': 'Remove card', onpointerdown: (e) => e.stopPropagation(),
        onclick: () => { if (!c.text || confirm('Remove this card?')) ctx.remove('cards', c.id); } }, '×')),
    h('textarea', { name: `card-${c.id}`, rows: 3, placeholder: 'Write here…', 'aria-label': 'Card text',
      onchange: (e) => ctx.put('cards', c.id, { text: e.target.value.trim() }) }, c.text));
  return el;
}

/** Move a card with the pointer; drop it in whichever quadrant is underneath. */
function drag(ctx, el, c, e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const board = el.closest('.soar-board');
  const start = el.getBoundingClientRect();
  const dx = e.clientX - start.left;
  const dy = e.clientY - start.top;
  ctx.dragging = true;
  el.classList.add('dragging');
  el.style.width = `${start.width}px`;
  el.style.setProperty('--q', getComputedStyle(el).getPropertyValue('--q'));
  document.body.append(el);
  el.style.position = 'fixed';
  const move = (ev) => {
    el.style.left = `${ev.clientX - dx}px`;
    el.style.top = `${ev.clientY - dy}px`;
    const under = zoneAt(ev);
    for (const z of board.querySelectorAll('.soar-q')) z.classList.toggle('over', z === under);
  };
  const up = (ev) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const zone = zoneAt(ev);
    el.remove();
    board.querySelectorAll('.soar-q').forEach((z) => z.classList.remove('over'));
    ctx.endDrag();
    if (!zone) return ctx.render();
    const r = zone.getBoundingClientRect();
    ctx.put('cards', c.id, {
      quadrant: zone.dataset.q,
      x: clamp((ev.clientX - dx - r.left) / r.width, 0, 1 - CARD_W),
      y: clamp((ev.clientY - dy - r.top) / r.height, 0.08, 0.92),
    });
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

const zoneAt = (ev) => document.elementsFromPoint(ev.clientX, ev.clientY).find((n) => n.classList?.contains('soar-q'));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

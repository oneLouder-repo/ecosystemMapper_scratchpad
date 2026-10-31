import { Sprite } from '../core/Sprite.js';
import { dockCenter, dockPoint } from './geometry.js';

/** Line width for each strength, 1 (weak) to 5 (strong). */
export const STRENGTH_WIDTH = [0, 1, 1.75, 2.5, 3.75, 5.5];

/**
 * End shapes, drawn pointing along +x with the tip at the origin, `s` long.
 * A connector type picks one for its `end` (and optionally its `start`).
 */
const CAPS = {
  arrow: (s) => ({ d: `M 0 0 L ${-s} ${-s * 0.55} L ${-s} ${s * 0.55} Z`, fill: true }),
  chevron: (s) => ({ d: `M ${-s} ${-s * 0.6} L 0 0 L ${-s} ${s * 0.6}`, fill: false }),
  diamond: (s) => ({ d: `M 0 0 L ${-s / 2} ${-s * 0.42} L ${-s} 0 L ${-s / 2} ${s * 0.42} Z`, fill: true }),
  dot: (s) => ({ d: circle(-s * 0.32, s * 0.32), fill: true }),
  circle: (s) => ({ d: circle(-s * 0.36, s * 0.36), fill: false, hollow: true }),
  bar: (s) => ({ d: `M ${-s * 0.15} ${-s * 0.6} V ${s * 0.6}`, fill: false }),
};
function circle(cx, r) {
  return `M ${cx - r} 0 A ${r} ${r} 0 1 0 ${cx + r} 0 A ${r} ${r} 0 1 0 ${cx - r} 0 Z`;
}

/**
 * One connector. Each end is docked to an actor or floats at a point.
 * When selected, round handles appear at both ends: drag one onto an
 * actor to re-dock it, or onto empty space to leave it floating.
 */
export class ConnectorView extends Sprite {
  interactive = true;
  kind = 'connector';
  #selected = false;

  constructor(id) {
    super();
    this.id = id;
    this.node.classList.add('connector');
    this.hit = this.draw('path', { class: 'connector-hit' });
    this.line = this.draw('path', { class: 'connector-line' });
    this.startCap = this.draw('path', { class: 'connector-cap' });
    this.endCap = this.draw('path', { class: 'connector-cap' });
    this.label = this.draw('text', { class: 'connector-label', 'dominant-baseline': 'central' });
    this.fromHandle = this.draw('circle', { class: 'handle', r: 7, 'data-handle': 'from' });
    this.toHandle = this.draw('circle', { class: 'handle', r: 7, 'data-handle': 'to' });
  }

  update(conn, map, lens) {
    const fc = dockCenter(map, conn.from);
    const tc = dockCenter(map, conn.to);
    if (!fc || !tc) return;
    // A gentle curve, bowed to the left of the direction of travel, so
    // A→B and B→A between the same actors sit side by side.
    const len = Math.hypot(tc.x - fc.x, tc.y - fc.y) || 1;
    const bow = Math.min(40, len * 0.12);
    const ctrl = {
      x: (fc.x + tc.x) / 2 + ((tc.y - fc.y) / len) * bow,
      y: (fc.y + tc.y) / 2 - ((tc.x - fc.x) / len) * bow,
    };
    const a = dockPoint(map, conn.from, ctrl);
    const b = dockPoint(map, conn.to, ctrl);
    const d = `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`;
    const mid = { x: 0.25 * a.x + 0.5 * ctrl.x + 0.25 * b.x, y: 0.25 * a.y + 0.5 * ctrl.y + 0.25 * b.y };
    this.hit.setAttribute('d', d);
    this.line.setAttribute('d', d);

    const type = lens.typeById[conn.type];
    const width = STRENGTH_WIDTH[conn.strength] ?? STRENGTH_WIDTH[3];
    this.node.classList.toggle('unmapped', !type);
    this.line.style.stroke = type?.color ?? '';
    this.line.style.strokeDasharray = type?.dash ?? '';
    this.line.style.strokeWidth = width;
    this.node.style.color = type?.color ?? '';
    // End shapes follow the curve's direction at each end, and grow a little with strength.
    const size = 9 + width * 1.6;
    this.#cap(this.endCap, type ? type.end : 'arrow', b, ctrl, size, width);
    this.#cap(this.startCap, type?.start, a, ctrl, size, width);

    // Label sits just outside the bow, so labels on paired connectors don't collide.
    const n = { x: (tc.y - fc.y) / len, y: -(tc.x - fc.x) / len };
    this.label.setAttribute('x', mid.x + n.x * 10);
    this.label.setAttribute('y', mid.y + n.y * 10);
    this.label.setAttribute('text-anchor', n.x > 0.3 ? 'start' : n.x < -0.3 ? 'end' : 'middle');
    this.label.textContent = conn.label || '';

    this.fromHandle.setAttribute('cx', a.x);
    this.fromHandle.setAttribute('cy', a.y);
    this.toHandle.setAttribute('cx', b.x);
    this.toHandle.setAttribute('cy', b.y);
    this.fromHandle.classList.toggle('docked', Boolean(conn.from.actorId));
    this.toHandle.classList.toggle('docked', Boolean(conn.to.actorId));
  }

  #cap(el, shape, tip, from, size, width) {
    const make = CAPS[shape];
    if (!make) { el.setAttribute('d', ''); return; }
    const { d, fill, hollow } = make(size);
    const angle = (Math.atan2(tip.y - from.y, tip.x - from.x) * 180) / Math.PI;
    el.setAttribute('d', d);
    el.setAttribute('transform', `translate(${tip.x} ${tip.y}) rotate(${angle})`);
    el.classList.toggle('filled', fill);
    el.classList.toggle('hollow', Boolean(hollow));
    el.style.strokeWidth = Math.max(1.5, Math.min(width, 3));
  }

  get selected() { return this.#selected; }
  set selected(v) {
    this.#selected = v;
    this.node.classList.toggle('selected', v);
  }
}

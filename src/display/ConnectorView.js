import { Sprite } from '../core/Sprite.js';
import { dockCenter, dockPoint } from './geometry.js';

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
    this.line = this.draw('path', { class: 'connector-line', 'marker-end': 'url(#arrow)' });
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
    this.node.classList.toggle('unmapped', !type);
    this.line.style.stroke = type?.color ?? '';
    this.line.style.strokeDasharray = type?.dash ?? '';
    this.node.style.color = type?.color ?? '';

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

  get selected() { return this.#selected; }
  set selected(v) {
    this.#selected = v;
    this.node.classList.toggle('selected', v);
  }
}

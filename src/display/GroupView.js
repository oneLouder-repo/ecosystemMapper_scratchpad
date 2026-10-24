import { Sprite } from '../core/Sprite.js';

const PAD = 22;

/** A labelled frame around a group's member actors. Click the frame or its tab to select the group. */
export class GroupView extends Sprite {
  interactive = true;
  kind = 'group';
  #selected = false;

  constructor(id) {
    super();
    this.id = id;
    this.node.classList.add('group');
    this.frame = this.draw('rect', { class: 'group-frame' });
    this.tab = this.draw('rect', { class: 'group-tab', height: 22 });
    this.text = this.draw('text', { class: 'group-label' });
  }

  update(group, world) {
    const members = group.memberIds.map((id) => world.actors[id]).filter(Boolean);
    this.node.style.display = members.length ? '' : 'none';
    if (!members.length) return;
    const x0 = Math.min(...members.map((a) => a.x - a.w / 2)) - PAD;
    const y0 = Math.min(...members.map((a) => a.y - a.h / 2)) - PAD;
    const x1 = Math.max(...members.map((a) => a.x + a.w / 2)) + PAD;
    const y1 = Math.max(...members.map((a) => a.y + a.h / 2)) + PAD;
    for (const [k, v] of Object.entries({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })) this.frame.setAttribute(k, v);
    this.text.textContent = group.label || 'Group';
    this.text.setAttribute('x', x0 + 8);
    this.text.setAttribute('y', y0 - 7);
    this.tab.setAttribute('x', x0);
    this.tab.setAttribute('y', y0 - 22);
    this.tab.setAttribute('width', Math.max(60, (group.label || 'Group').length * 7.4 + 16));
  }

  get selected() { return this.#selected; }
  set selected(v) {
    this.#selected = v;
    this.node.classList.toggle('selected', v);
  }
}

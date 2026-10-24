import { Sprite } from '../core/Sprite.js';

/** One actor on the board: a rounded card coloured by its lens category. */
export class ActorView extends Sprite {
  interactive = true;
  kind = 'actor';
  #selected = false;

  constructor(id) {
    super();
    this.id = id;
    this.node.classList.add('actor');
    this.box = this.draw('rect');
    this.mark = this.draw('path', { class: 'agent-mark' });
    this.text = this.draw('text', { class: 'actor-label', 'text-anchor': 'middle' });
    this.badge = this.draw('text', { class: 'actor-badge', 'text-anchor': 'middle' });
  }

  update(actor, lens) {
    this.moveTo(actor.x, actor.y);
    const { w, h } = actor;
    this.box.setAttribute('x', -w / 2);
    this.box.setAttribute('y', -h / 2);
    this.box.setAttribute('width', w);
    this.box.setAttribute('height', h);

    const category = lens.categoryById[actor.category];
    const agent = actor.kind === 'agent';
    this.node.classList.toggle('unmapped', !category);
    this.node.classList.toggle('agent', agent);
    // Agents carry a solid corner notch, a placeholder mark for agency.
    this.mark.setAttribute('d', agent ? `M ${-w / 2} ${-h / 2} h 16 L ${-w / 2} ${-h / 2 + 16} Z` : '');
    this.box.style.fill = category?.color ?? '';
    this.#setLabel(actor.label || 'Untitled', w, h);
    this.badge.setAttribute('y', h / 2 - 9);
    const categoryLabel = category ? category.label : `unmapped: ${actor.category}`;
    this.badge.textContent = agent ? `Agent · ${categoryLabel}` : categoryLabel;
  }

  // Wrap the label onto up to two lines that fit the card.
  #setLabel(label, w, h) {
    const maxChars = Math.max(6, Math.floor((w - 20) / 8));
    const lines = wrap(label, maxChars);
    const lineHeight = 17;
    const top = -h / 2 + 22 - ((lines.length - 1) * lineHeight) / 2 + (lines.length > 1 ? 4 : 0);
    this.text.replaceChildren();
    lines.forEach((line, i) => {
      const t = this.draw('tspan', { x: 0, y: top + i * lineHeight });
      t.textContent = line;
      this.text.append(t);
    });
  }

  get selected() { return this.#selected; }
  set selected(v) {
    if (v === this.#selected) return;
    this.#selected = v;
    this.node.classList.toggle('selected', v);
    if (v) this.addEventListener('enterFrame', this.#pulse);
    else {
      this.removeEventListener('enterFrame', this.#pulse);
      this.box.style.strokeOpacity = '';
    }
  }

  // A gentle breathing outline while selected, to show off enterFrame.
  #pulse = (e) => {
    this.box.style.strokeOpacity = 0.55 + 0.45 * Math.sin(e.time / 260);
  };
}

function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const line = lines.at(-1);
    if (!line) lines[lines.length - 1] = word;
    else if ((line + ' ' + word).length <= maxChars) lines[lines.length - 1] = `${line} ${word}`;
    else lines.push(word);
  }
  if (lines.length > 2) lines.splice(1, lines.length, `${lines.slice(1).join(' ')}`);
  return lines.map((l) => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l));
}

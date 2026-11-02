import { Sprite } from '../core/Sprite.js';

/**
 * One actor on the board: a rounded card coloured by its lens category,
 * with a dock box at its top-left corner: drag from it to draw a connector.
 *
 *   signal()        one ping, e.g. when its zone is clicked
 *   pulsing = true  keep pinging (data viz focus)
 */
const SIGNAL_MS = 1100;

export class ActorView extends Sprite {
  interactive = true;
  kind = 'actor';
  #selected = false;

  constructor(id) {
    super();
    this.id = id;
    this.node.classList.add('actor');
    this.ping = this.draw('rect', { class: 'actor-ping' });
    this.box = this.draw('rect');
    this.mark = this.draw('path', { class: 'agent-mark' });
    this.text = this.draw('text', { class: 'actor-label', 'text-anchor': 'middle' });
    this.badge = this.draw('text', { class: 'actor-badge', 'text-anchor': 'middle' });
    this.dock = this.draw('rect', { class: 'actor-dock', width: 16, height: 16, rx: 3, 'data-dock': '' });
    this.dock.append(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'title'), { textContent: 'Drag to connect' }));
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
    // Agents carry a solid notch in the top-right corner, a placeholder mark for agency.
    this.mark.setAttribute('d', agent ? `M ${w / 2} ${-h / 2} h -16 L ${w / 2} ${-h / 2 + 16} Z` : '');
    this.dock.setAttribute('x', -w / 2 - 6);
    this.dock.setAttribute('y', -h / 2 - 6);
    for (const [k, v] of Object.entries({ x: -w / 2, y: -h / 2, width: w, height: h, rx: 8 })) this.ping.setAttribute(k, v);
    this.size = { w, h };
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

  /** Ping once: a ring spreads out from the card and fades. */
  signal() {
    this.#signalStart = null;
    this.addEventListener('enterFrame', this.#signal);
  }

  get pulsing() { return this.#pulsing; }
  set pulsing(v) {
    this.#pulsing = v;
    this.node.classList.toggle('focus', v);
    if (v) this.signal();
  }

  #pulsing = false;
  #signalStart = null;
  #signal = (e) => {
    this.#signalStart ??= e.time;
    const t = (e.time - this.#signalStart) / SIGNAL_MS;
    if (t >= 1) {
      this.ping.style.opacity = 0;
      if (this.#pulsing) { this.#signalStart = e.time; return; }
      this.removeEventListener('enterFrame', this.#signal);
      return;
    }
    const grow = 4 + t * 22;
    const { w, h } = this.size ?? { w: 150, h: 58 };
    for (const [k, v] of Object.entries({ x: -w / 2 - grow, y: -h / 2 - grow, width: w + grow * 2, height: h + grow * 2, rx: 8 + grow })) this.ping.setAttribute(k, v);
    this.ping.style.opacity = (1 - t) * 0.9;
  };

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

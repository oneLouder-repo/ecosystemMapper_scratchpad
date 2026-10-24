import { EventDispatcher } from './EventDispatcher.js';
import { svg } from './svg.js';

/**
 * The base of the display list, after AS3's DisplayObject / DisplayObjectContainer.
 * Each one wraps an SVG <g>. Set x, y, scale, rotation, alpha and visible
 * and the transform updates. Children nest with addChild / removeChild.
 *
 * Set `interactive = true` on a subclass to make it a pointer target:
 * the stage walks up from the element under the pointer to the nearest
 * interactive display object and reports it as `e.view`.
 */
export class DisplayObject extends EventDispatcher {
  #x = 0;
  #y = 0;
  #scale = 1;
  #rotation = 0;
  #alpha = 1;
  #visible = true;

  interactive = false;

  constructor(node = svg('g')) {
    super();
    this.node = node;
    this.node.__view = this;
    this.parent = null;
    this.children = [];
  }

  get x() { return this.#x; }
  set x(v) { this.#x = v; this.#applyTransform(); }

  get y() { return this.#y; }
  set y(v) { this.#y = v; this.#applyTransform(); }

  get scale() { return this.#scale; }
  set scale(v) { this.#scale = v; this.#applyTransform(); }

  get rotation() { return this.#rotation; }
  set rotation(v) { this.#rotation = v; this.#applyTransform(); }

  get alpha() { return this.#alpha; }
  set alpha(v) { this.#alpha = v; this.node.style.opacity = v; }

  get visible() { return this.#visible; }
  set visible(v) { this.#visible = v; this.node.style.display = v ? '' : 'none'; }

  /** Set x and y together with one transform update. */
  moveTo(x, y) {
    this.#x = x;
    this.#y = y;
    this.#applyTransform();
  }

  addChild(child) {
    child.parent?.removeChild(child);
    this.children.push(child);
    this.node.appendChild(child.node);
    child.parent = this;
    child.dispatchEvent('added');
    return child;
  }

  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i === -1) return child;
    this.children.splice(i, 1);
    child.node.remove();
    child.parent = null;
    child.dispatchEvent('removed');
    return child;
  }

  removeChildren() {
    for (const child of [...this.children]) this.removeChild(child);
  }

  /** The Stage this object is on, or null if it isn't on one. */
  get stage() {
    let p = this;
    while (p.parent) p = p.parent;
    return p.isStage ? p : null;
  }

  #applyTransform() {
    this.node.setAttribute(
      'transform',
      `translate(${this.#x} ${this.#y}) rotate(${this.#rotation}) scale(${this.#scale})`,
    );
  }
}

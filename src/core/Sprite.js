import { DisplayObject } from './DisplayObject.js';
import { svg } from './svg.js';

/** A display object that draws its own SVG shapes. */
export class Sprite extends DisplayObject {
  /** Draw an SVG element into this sprite and return it, e.g. this.draw('rect', { width: 10 }). */
  draw(tag, attrs = {}) {
    return svg(tag, attrs, this.node);
  }

  /** Remove everything drawn, keeping child display objects. */
  clearGraphics() {
    const childNodes = new Set(this.children.map((c) => c.node));
    for (const el of [...this.node.childNodes]) if (!childNodes.has(el)) el.remove();
  }
}

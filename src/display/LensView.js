import { Sprite } from '../core/Sprite.js';

const SPAN = { left: -3000, width: 9000 };

/** Draws the active lens as the board's backdrop. One renderer per lens layout. */
export class LensView extends Sprite {
  lensId = null;

  render(lens) {
    this.lensId = lens.id;
    this.clearGraphics();
    (renderers[lens.layout] ?? renderers.bands)(this, lens);
  }
}

const renderers = {
  bands(view, lens) {
    const h = lens.bandHeight;
    lens.regions.forEach((region, i) => {
      const y = i * h;
      view.draw('rect', { class: 'lens-band', x: SPAN.left, y, width: SPAN.width, height: h, fill: region.tint });
      view.draw('line', { class: 'lens-divider', x1: SPAN.left, x2: SPAN.left + SPAN.width, y1: y, y2: y });
      view.draw('text', { class: 'lens-label', x: 24, y: y + 44 }).textContent = region.label;
      view.draw('text', { class: 'lens-hint', x: 24, y: y + 68 }).textContent = region.hint ?? '';
    });
  },
};

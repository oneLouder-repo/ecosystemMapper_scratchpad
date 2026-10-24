import { Sprite } from '../core/Sprite.js';

/**
 * Draws the active lens as the board's backdrop, one renderer per lens
 * layout. Each region's shape is kept so it can be highlighted while an
 * actor is dragged over it.
 */
export class LensView extends Sprite {
  lensId = null;
  #shapes = new Map();
  #highlighted = null;

  render(lens) {
    this.lensId = lens.id;
    this.clearGraphics();
    this.#shapes.clear();
    this.#highlighted = null;
    (renderers[lens.layout] ?? renderers.bands)(this, lens, (region, shape) => {
      shape.classList.add('lens-region');
      this.#shapes.set(region.id, shape);
    });
  }

  highlight(regionId) {
    if (regionId === this.#highlighted) return;
    this.#shapes.get(this.#highlighted)?.classList.remove('highlight');
    this.#shapes.get(regionId)?.classList.add('highlight');
    this.#highlighted = regionId ?? null;
  }
}

const renderers = {
  bands(view, lens, keep) {
    const h = lens.bandHeight;
    const left = -3000;
    const width = 9000;
    lens.regions.forEach((region, i) => {
      const y = i * h;
      keep(region, view.draw('rect', { x: left, y, width, height: h, fill: region.tint }));
      view.draw('line', { class: 'lens-divider', x1: left, x2: left + width, y1: y, y2: y });
      label(view, region, 24, y + 44, 'start');
    });
  },

  rings(view, lens, keep) {
    const { x: cx, y: cy } = lens.center;
    // Outermost first so inner rings paint on top.
    for (const region of [...lens.regions].reverse()) {
      keep(region, view.draw('circle', { cx, cy, r: region.radius, fill: region.tint }));
    }
    lens.regions.forEach((region, i) => {
      const inner = i ? lens.regions[i - 1].radius : 0;
      // Label sits in the top of each ring's band (centred for the innermost disc).
      const y = i ? cy - (inner + region.radius) / 2 - 8 : cy - region.radius + 48;
      label(view, region, cx, y, 'middle');
    });
  },

  triangle(view, lens, keep) {
    const { centerX, top, bottom, halfWidth } = lens.triangle;
    const n = lens.regions.length;
    const widthAt = (y) => (halfWidth * (bottom - y)) / (bottom - top);
    lens.regions.forEach((region, i) => {
      const y0 = top + ((bottom - top) * i) / n;
      const y1 = top + ((bottom - top) * (i + 1)) / n;
      const w0 = widthAt(y0);
      const w1 = widthAt(y1);
      const points = [
        [centerX - w0, y0],
        [centerX + w0, y0],
        [centerX + w1, y1],
        [centerX - w1, y1],
      ].map((p) => p.join(',')).join(' ');
      keep(region, view.draw('polygon', { points, fill: region.tint }));
      label(view, region, centerX, y0 + 42, 'middle');
    });
  },
};

function label(view, region, x, y, anchor) {
  view.draw('text', { class: 'lens-label', x, y, 'text-anchor': anchor }).textContent = region.label;
  view.draw('text', { class: 'lens-hint', x, y: y + 22, 'text-anchor': anchor }).textContent = region.hint ?? '';
}

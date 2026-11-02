import { Sprite } from '../core/Sprite.js';
import { bandsOf } from '../lenses/index.js';

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
    this.node.classList.toggle('small-labels', lens.labelSize === 'small');
    (renderers[lens.layout] ?? renderers.bands)(this, lens, (region, shape) => {
      shape.classList.add('lens-region');
      this.#shapes.set(region.id, shape);
    });
  }

  /** The region a drawn shape belongs to (e.g. the element under a click), or null. */
  regionOf(el) {
    for (const [id, shape] of this.#shapes) if (shape === el) return id;
    return null;
  }

  /** Light a region up briefly. */
  flash(regionId, ms = 900) {
    const shape = this.#shapes.get(regionId);
    if (!shape) return;
    shape.classList.add('flash');
    clearTimeout(shape.flashTimer);
    shape.flashTimer = setTimeout(() => shape.classList.remove('flash'), ms);
  }

  highlight(regionId) {
    if (regionId === this.#highlighted) return;
    this.#shapes.get(this.#highlighted)?.classList.remove('highlight');
    this.#shapes.get(regionId)?.classList.add('highlight');
    this.#highlighted = regionId ?? null;
  }
}

const hintOf = (region) => [region.group, region.hint].filter(Boolean).join(' · ');

const renderers = {
  rings(view, lens, keep) {
    const { x: cx, y: cy } = lens.center;
    const bands = bandsOf(lens);
    // Outermost first so inner rings paint on top.
    for (const { region } of [...bands].reverse()) {
      keep(region, view.draw('circle', { cx, cy, r: region.radius, fill: region.tint }));
    }
    for (const { region, inner, outer } of bands) {
      // Label sits in the top of each ring's band (near the top of the innermost disc).
      const y = inner ? cy - (inner + outer) / 2 - 6 : cy - outer + 40;
      label(view, region.label, hintOf(region), cx, y, 'middle');
    }
  },

  triangle(view, lens, keep) {
    const { centerX, top, bottom, halfWidth } = lens.triangle;
    const widthAt = (y) => (halfWidth * (bottom - y)) / (bottom - top);
    for (const { region, y0, y1 } of bandsOf(lens)) {
      const points = [
        [centerX - widthAt(y0), y0],
        [centerX + widthAt(y0), y0],
        [centerX + widthAt(y1), y1],
        [centerX - widthAt(y1), y1],
      ].map((p) => p.join(',')).join(' ');
      keep(region, view.draw('polygon', { points, fill: region.tint }));
      label(view, region.label, hintOf(region), centerX, y0 + 40, 'middle');
    }
  },

  bands(view, lens, keep) {
    const left = -lens.width / 2;
    let lastGroup = null;
    for (const { region, y0, y1 } of bandsOf(lens)) {
      keep(region, view.draw('rect', { x: left, y: y0, width: lens.width, height: y1 - y0, fill: region.tint }));
      label(view, region.label, region.hint ?? '', left + 18, y0 + (region.hint ? 28 : (y1 - y0) / 2 + 6), 'start');
      if (region.group && region.group !== lastGroup) {
        view.draw('text', { class: 'lens-group', x: -left - 18, y: y0 + 26, 'text-anchor': 'end' }).textContent = region.group;
      }
      lastGroup = region.group;
    }
  },

  grid(view, lens, keep) {
    renderers.bands(view, lens, keep);
    const bands = bandsOf(lens);
    const top = bands[0].y0;
    const bottom = bands.at(-1).y1;
    const step = lens.width / lens.columns.length;
    lens.columns.forEach((col, i) => {
      const x = -lens.width / 2 + i * step;
      if (i) view.draw('line', { class: 'lens-divider', x1: x, x2: x, y1: top, y2: bottom });
      view.draw('text', { class: 'lens-column', x: x + step / 2, y: top - 22, 'text-anchor': 'middle' }).textContent = col.label;
    });
    view.draw('text', { class: 'lens-axis', x: lens.width / 2, y: top - 46, 'text-anchor': 'end' }).textContent = 'breadth of change →';
  },
};

function label(view, text, hint, x, y, anchor) {
  view.draw('text', { class: 'lens-label', x, y, 'text-anchor': anchor }).textContent = text;
  if (hint) view.draw('text', { class: 'lens-hint', x, y: y + 20, 'text-anchor': anchor }).textContent = hint;
}

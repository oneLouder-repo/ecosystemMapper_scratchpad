import { h } from './dom.js';
import { svg } from '../core/svg.js';

/** The platform's mark (a little dashboard of tiles) and its name, Dashi. */
export function Wordmark(size = 22, { text = true } = {}) {
  const mark = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'dashi-mark', 'aria-hidden': 'true' });
  svg('rect', { x: 1, y: 1, width: 22, height: 22, rx: 6, class: 'dashi-mark-bg' }, mark);
  svg('rect', { x: 5, y: 5, width: 6, height: 9, rx: 1.5, class: 'dashi-mark-tile' }, mark);
  svg('rect', { x: 13, y: 5, width: 6, height: 5, rx: 1.5, class: 'dashi-mark-tile' }, mark);
  svg('rect', { x: 13, y: 12, width: 6, height: 7, rx: 1.5, class: 'dashi-mark-tile dim' }, mark);
  svg('rect', { x: 5, y: 16, width: 6, height: 3, rx: 1.5, class: 'dashi-mark-tile dim' }, mark);
  return h('span', { class: 'dashi-wordmark', style: `font-size:${Math.round(size * 0.86)}px` }, mark, text && h('span', {}, 'Dashi'));
}

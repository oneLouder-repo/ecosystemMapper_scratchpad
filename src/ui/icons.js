import { svg } from '../core/svg.js';

/**
 * Monochrome line icons on a 24×24 grid, drawn with currentColor so they
 * follow the text colour. A tool's `icon` can be one of these names or raw
 * SVG path data.
 */
export const ICONS = {
  select: 'M6 3 L18 13 L12.5 13.8 L15.5 20 L13 21 L10 14.8 L6 18.5 Z',
  actor: 'M4 7 H20 V17 H4 Z',
  connect: 'M5 19 L18 6 M10 6 H18 V14',
  pan: 'M12 3 V21 M3 12 H21 M12 3 L9.5 5.5 M12 3 L14.5 5.5 M12 21 L9.5 18.5 M12 21 L14.5 18.5 M3 12 L5.5 9.5 M3 12 L5.5 14.5 M21 12 L18.5 9.5 M21 12 L18.5 14.5',
  eye: 'M2 12 C5 6.5 8.5 5 12 5 S19 6.5 22 12 C19 17.5 15.5 19 12 19 S5 17.5 2 12 Z M12 9 A3 3 0 1 0 12.01 9 Z',
  eyeOff: 'M2 12 C5 6.5 8.5 5 12 5 S19 6.5 22 12 C19 17.5 15.5 19 12 19 S5 17.5 2 12 Z M4 4 L20 20',
  lock: 'M6 11 H18 V20 H6 Z M8.5 11 V8 A3.5 3.5 0 0 1 15.5 8 V11',
  unlock: 'M6 11 H18 V20 H6 Z M8.5 11 V8 A3.5 3.5 0 0 1 15.2 6.5',
  plus: 'M12 5 V19 M5 12 H19',
  fit: 'M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15',
};

export function icon(nameOrPath, size = 20) {
  const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'icon', 'aria-hidden': 'true' });
  svg('path', { d: ICONS[nameOrPath] ?? nameOrPath }, el);
  return el;
}

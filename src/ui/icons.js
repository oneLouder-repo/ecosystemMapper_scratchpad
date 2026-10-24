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
  home: 'M4 11 L12 4 L20 11 M6 9.5 V20 H18 V9.5',
  mapper: 'M6 7 A2.5 2.5 0 1 0 6.01 7 Z M18 6 A2.5 2.5 0 1 0 18.01 6 Z M12 18 A2.5 2.5 0 1 0 12.01 18 Z M8 8.5 L11 16 M16.5 8 L13 16 M8.5 6.5 H15.5',
  strategy: 'M12 3 V8 M6 8 H18 M6 8 V12 M18 8 V12 M3 12 H9 V16 H3 Z M15 12 H21 V16 H15 Z M9 3 H15 V6 H9 Z M18 16 V19 H14 V21 H22 V19',
  org: 'M8 8 A3 3 0 1 0 8.01 8 Z M17 9 A2.5 2.5 0 1 0 17.01 9 Z M2.5 20 C3 15.5 5 14 8 14 S13 15.5 13.5 20 M14 14.5 C14.8 13.6 15.8 13.2 17 13.2 C19.5 13.2 21.2 15 21.5 19',
  timeline: 'M3 12 H21 M7 9 V15 M12 10 V14 M17 8 V16',
  trash: 'M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7',
  palette: 'M12 3 C6.5 3 3 7 3 11.5 C3 16 6.5 20 11 20 C12.5 20 13 19 12.5 17.8 C12 16.5 12.8 15.5 14 15.5 H16.5 C19 15.5 21 13.5 21 11 C21 6.5 17 3 12 3 Z M7.5 11 A1 1 0 1 0 7.51 11 Z M10.5 7 A1 1 0 1 0 10.51 7 Z M15.5 7.5 A1 1 0 1 0 15.51 7.5 Z',
  globe: 'M12 3 A9 9 0 1 0 12.01 3 Z M3 12 H21 M12 3 C9 6 9 18 12 21 M12 3 C15 6 15 18 12 21',
  doc: 'M6 3 H14 L19 8 V21 H6 Z M14 3 V8 H19 M9 13 H16 M9 17 H16',
  link: 'M10 14 L14 10 M8.5 11.5 L6 14 A3 3 0 0 0 10 18 L12.5 15.5 M11.5 8.5 L14 6 A3 3 0 0 1 18 10 L15.5 12.5',
  book: 'M4 5 C7 4 10 4.5 12 6 C14 4.5 17 4 20 5 V19 C17 18 14 18.5 12 20 C10 18.5 7 18 4 19 Z M12 6 V20',
  media: 'M3 5 H21 V19 H3 Z M10 9 V15 L15 12 Z',
  person: 'M12 8 A3.5 3.5 0 1 0 12.01 8 Z M5 20 C5.5 15.5 8 14 12 14 S18.5 15.5 19 20',
  chart: 'M4 4 V20 H20 M8 16 V12 M12 16 V8 M16 16 V11',
};

export function icon(nameOrPath, size = 20) {
  const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, class: 'icon', 'aria-hidden': 'true' });
  svg('path', { d: ICONS[nameOrPath] ?? nameOrPath }, el);
  return el;
}

// Custom board cursors: a black arrow with a small badge, tip at (3, 2).
const ARROW = 'M3 2 L3 17 L7 13.2 L9.8 19.5 L12.2 18.4 L9.5 12.3 L14.8 12.3 Z';
const BADGES = {
  addActor: '<rect x="15" y="15" width="12" height="12" fill="#fff" stroke="#000" stroke-width="1.4"/><path d="M21 17.5 V24.5 M17.5 21 H24.5" stroke="#000" stroke-width="1.6"/>',
  connect: '<circle cx="17" cy="25" r="2.2" fill="#000"/><path d="M17 25 L26 16 M21 16 H26 V21" fill="none" stroke="#000" stroke-width="1.6"/>',
};

export const CURSORS = Object.fromEntries(
  Object.entries(BADGES).map(([name, badge]) => {
    const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><path d="${ARROW}" fill="#000" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>${badge}</svg>`;
    return [name, `url("data:image/svg+xml,${encodeURIComponent(svgText)}") 3 2, crosshair`];
  }),
);

export function cursorFor(name) {
  return CURSORS[name] ?? name ?? '';
}

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/**
 * A pannable, zoomable canvas for the Studio's boards, like the mapper's:
 * scroll (or drag the background) to pan, Ctrl or ⌘ + scroll to zoom
 * around the pointer, or use the zoom buttons.
 *
 *   const vp = Viewport(ctx.views.soar ??= {}, { home: (w, h) => ({ x: w / 2, y: h / 2, z: 0.5 }) });
 *   vp.world.append(...things in world units);
 *
 * `view` ({ x, y, z }: where the world's 0,0 sits on screen, and the zoom)
 * is kept by the caller, so the view survives redraws. `home(width, height)`
 * says where Centre goes; the first draw starts there.
 */
export function Viewport(view, { home, min = 0.15, max = 2.5, buttons = [] }) {
  const world = h('div', { class: 'vp-world' });
  const el = h('div', { class: 'vp', tabindex: '-1' }, world);
  const apply = () => {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    el.style.setProperty('--vp-z', view.z);
    el.style.backgroundPosition = `${view.x}px ${view.y}px`;
    el.style.backgroundSize = `${24 * view.z}px ${24 * view.z}px`;
    label.textContent = `${Math.round(view.z * 100)}%`;
  };
  const zoomAt = (z, cx, cy) => {
    z = Math.min(max, Math.max(min, z));
    view.x = cx - ((cx - view.x) * z) / view.z;
    view.y = cy - ((cy - view.y) * z) / view.z;
    view.z = z;
    apply();
  };
  const middle = () => ({ cx: el.clientWidth / 2, cy: el.clientHeight / 2 });
  const centre = () => { Object.assign(view, home(el.clientWidth, el.clientHeight)); apply(); };
  const label = h('span', { class: 'vp-zoom-label', 'aria-live': 'polite' });
  const controls = h('div', { class: 'vp-controls join' },
    h('button', { class: 'btn btn-sm join-item', title: 'Zoom out (Ctrl + scroll)', 'aria-label': 'Zoom out', onclick: () => { const { cx, cy } = middle(); zoomAt(view.z / 1.25, cx, cy); } }, '−'),
    h('button', { class: 'btn btn-sm join-item vp-zoom-btn', title: 'Back to 100%', onclick: () => { const { cx, cy } = middle(); zoomAt(1, cx, cy); } }, label),
    h('button', { class: 'btn btn-sm join-item', title: 'Zoom in (Ctrl + scroll)', 'aria-label': 'Zoom in', onclick: () => { const { cx, cy } = middle(); zoomAt(view.z * 1.25, cx, cy); } }, '+'),
    h('button', { class: 'btn btn-sm join-item', title: 'Back to the centre', onclick: centre }, icon('fit', 15), 'Centre'),
    buttons);
  el.append(controls);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(view.z * Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
    else { view.x -= e.deltaX; view.y -= e.deltaY; apply(); }
  }, { passive: false });
  // Drag the background to pan.
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    // Pan from the background, or anything marked data-pan, but never from what sits on it.
    const near = e.target.closest('[data-pan], .block, .soar-card, .patch-wire, button, a, input, textarea, select');
    if (e.target !== el && e.target !== world && !near?.hasAttribute('data-pan')) return;
    e.preventDefault();
    el.focus({ preventScroll: true });
    const start = { x: e.clientX - view.x, y: e.clientY - view.y };
    el.classList.add('panning');
    const move = (ev) => { view.x = ev.clientX - start.x; view.y = ev.clientY - start.y; apply(); };
    const up = () => { el.classList.remove('panning'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  const ready = view.z != null;
  if (!ready) Object.assign(view, { x: 0, y: 0, z: 1 });
  apply();
  // Start at home once the canvas has a size.
  if (!ready) requestAnimationFrame(() => { if (el.clientWidth) centre(); });

  return {
    el,
    world,
    view,
    apply,
    centre,
    /** A screen point as world units. */
    toWorld: (clientX, clientY) => {
      const r = el.getBoundingClientRect();
      return { x: (clientX - r.left - view.x) / view.z, y: (clientY - r.top - view.y) / view.z };
    },
  };
}

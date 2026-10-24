import { DisplayObject } from './DisplayObject.js';
import { svg } from './svg.js';

/**
 * The root of the display list. Owns the <svg>, the camera and the frame tick.
 *
 * The stage's own x, y and scale are the camera: x/y is the screen offset
 * of world (0, 0) and scale is the zoom.
 *
 * Events dispatched on the stage (tools listen to these):
 *   pointerdown, pointermove, pointerup, dblclick
 *     { worldX, worldY, screenX, screenY, view, handle, shiftKey, altKey, original }
 *   camera   after a pan or zoom
 *
 * Pointer events are also dispatched on the hit view itself, so a view can
 * listen for its own clicks AS3-style.
 *
 * Every animation frame, objects with an `enterFrame` listener get
 * { type: 'enterFrame', time, delta }.
 */
export class Stage extends DisplayObject {
  isStage = true;
  time = 0;

  constructor(svgEl) {
    super(svg('g', { class: 'world' }));
    this.svgEl = svgEl;
    svgEl.appendChild(this.node);

    // Fixed layers, back to front.
    this.lensLayer = this.addChild(new DisplayObject(svg('g', { class: 'layer-lens' })));
    this.connectorLayer = this.addChild(new DisplayObject(svg('g', { class: 'layer-connectors' })));
    this.actorLayer = this.addChild(new DisplayObject(svg('g', { class: 'layer-actors' })));
    this.overlayLayer = this.addChild(new DisplayObject(svg('g', { class: 'layer-overlay' })));

    this.#bindPointer();
    this.#bindWheel();
    requestAnimationFrame(this.#tick);
  }

  /** Screen (client) coordinates to world coordinates. */
  toWorld(clientX, clientY) {
    const r = this.svgEl.getBoundingClientRect();
    return { x: (clientX - r.left - this.x) / this.scale, y: (clientY - r.top - this.y) / this.scale };
  }

  /** World coordinates to screen (client) coordinates. */
  toScreen(x, y) {
    const r = this.svgEl.getBoundingClientRect();
    return { x: r.left + this.x + x * this.scale, y: r.top + this.y + y * this.scale };
  }

  panBy(dx, dy) {
    this.moveTo(this.x + dx, this.y + dy);
    this.dispatchEvent('camera');
  }

  /** Zoom by a factor, keeping the given client point fixed on screen. */
  zoomAt(factor, clientX, clientY) {
    const w = this.toWorld(clientX, clientY);
    const r = this.svgEl.getBoundingClientRect();
    const s = Math.min(4, Math.max(0.2, this.scale * factor));
    this.scale = s;
    this.moveTo(clientX - r.left - w.x * s, clientY - r.top - w.y * s);
    this.dispatchEvent('camera');
  }

  #event(type, e) {
    const { x, y } = this.toWorld(e.clientX, e.clientY);
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    return {
      type,
      worldX: x,
      worldY: y,
      screenX: e.clientX,
      screenY: e.clientY,
      view: findView(hit),
      handle: hit?.closest?.('[data-handle]')?.dataset.handle ?? null,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      original: e,
    };
  }

  #emit(type, e) {
    const ev = this.#event(type, e);
    ev.view?.dispatchEvent({ ...ev });
    this.dispatchEvent(ev);
  }

  #bindPointer() {
    const el = this.svgEl;
    let middlePan = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.button === 1) {
        middlePan = { x: e.clientX, y: e.clientY };
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;
      el.setPointerCapture(e.pointerId);
      this.#emit('pointerdown', e);
    });
    el.addEventListener('pointermove', (e) => {
      if (middlePan) {
        this.panBy(e.clientX - middlePan.x, e.clientY - middlePan.y);
        middlePan = { x: e.clientX, y: e.clientY };
        return;
      }
      this.#emit('pointermove', e);
    });
    el.addEventListener('pointerup', (e) => {
      if (middlePan) { middlePan = null; return; }
      this.#emit('pointerup', e);
    });
    el.addEventListener('dblclick', (e) => this.#emit('dblclick', e));
  }

  #bindWheel() {
    // FigJam-style: wheel or two-finger scroll pans, ctrl/cmd + wheel (and pinch) zooms.
    this.svgEl.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) this.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
        else this.panBy(-e.deltaX, -e.deltaY);
      },
      { passive: false },
    );
  }

  #last = 0;
  #tick = (t) => {
    const delta = this.#last ? t - this.#last : 0;
    this.#last = t;
    this.time = t;
    dispatchFrame(this, t, delta);
    requestAnimationFrame(this.#tick);
  };
}

function dispatchFrame(obj, time, delta) {
  if (obj.hasEventListener('enterFrame')) obj.dispatchEvent({ type: 'enterFrame', time, delta });
  for (const child of [...obj.children]) dispatchFrame(child, time, delta);
}

function findView(el) {
  while (el) {
    if (el.__view?.interactive) return el.__view;
    el = el.parentNode;
  }
  return null;
}

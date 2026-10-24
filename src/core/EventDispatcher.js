/**
 * AS3-style event dispatcher. Anything that emits events extends this.
 *
 *   obj.addEventListener('drag', e => ...);
 *   obj.dispatchEvent({ type: 'drag', x, y });
 */
export class EventDispatcher {
  #listeners = new Map();

  addEventListener(type, fn) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type).add(fn);
    return this;
  }

  removeEventListener(type, fn) {
    this.#listeners.get(type)?.delete(fn);
    return this;
  }

  hasEventListener(type) {
    return (this.#listeners.get(type)?.size ?? 0) > 0;
  }

  /** Accepts an event object or a bare type string. Returns the event. */
  dispatchEvent(event) {
    if (typeof event === 'string') event = { type: event };
    event.target ??= this;
    event.currentTarget = this;
    for (const fn of [...(this.#listeners.get(event.type) ?? [])]) fn(event);
    return event;
  }
}

import { EventDispatcher } from '../core/EventDispatcher.js';
import { cursorFor } from '../ui/icons.js';

const HANDLERS = {
  pointerdown: 'onPointerDown',
  pointermove: 'onPointerMove',
  pointerup: 'onPointerUp',
  dblclick: 'onDoubleClick',
};

/**
 * Holds the tools and forwards stage events to the active one.
 *
 * A tool is a plain object, usually one file:
 *   {
 *     id, label, icon, key,          // key is the keyboard shortcut
 *     cursor,                        // optional: a name from ui/icons.js CURSORS, or any CSS cursor
 *     activate(ctx), deactivate(ctx),
 *     onPointerDown(e, ctx), onPointerMove(e, ctx), onPointerUp(e, ctx),
 *     onDoubleClick(e, ctx), onKeyDown(e, ctx),
 *   }
 * Every handler is optional. `e` is a stage event (see Stage.js).
 *
 * Events: 'change' when the active tool changes.
 */
export class ToolRegistry extends EventDispatcher {
  tools = new Map();
  active = null;

  constructor(ctx) {
    super();
    this.ctx = ctx;
    for (const [type, handler] of Object.entries(HANDLERS)) {
      ctx.stage.addEventListener(type, (e) => this.active?.[handler]?.(e, ctx));
    }
  }

  register(tool) {
    this.tools.set(tool.id, tool);
    return this;
  }

  /** Tools stay on until another is chosen. Choosing the active tool again toggles back to Select. */
  toggle(id) {
    this.use(this.active?.id === id && id !== 'select' ? 'select' : id);
  }

  use(id) {
    const tool = this.tools.get(id);
    if (!tool || tool === this.active) return;
    this.active?.deactivate?.(this.ctx);
    this.active = tool;
    tool.activate?.(this.ctx);
    this.ctx.stage.svgEl.style.cursor = cursorFor(tool.cursor);
    this.dispatchEvent({ type: 'change', tool });
  }

  /** Returns true if the key was handled. */
  handleKey(e) {
    if (this.active?.onKeyDown?.(e, this.ctx)) return true;
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    for (const tool of this.tools.values()) {
      if (tool.key && tool.key === e.key.toLowerCase()) {
        this.toggle(tool.id);
        return true;
      }
    }
    return false;
  }
}

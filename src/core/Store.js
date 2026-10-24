import { EventDispatcher } from './EventDispatcher.js';
import { applyOp } from './ops.js';

/**
 * Holds the current map and is the only thing that changes it.
 *
 *   store.apply(ops.moveActor(id, x, y));
 *   store.addEventListener('change', e => e.op);
 *
 * apply(op, { history: false }) changes the map without an undo entry,
 * which tools use for live previews while dragging. The final op of a drag
 * passes { inverse } so undo returns to where the drag started.
 */
export class Store extends EventDispatcher {
  constructor(map) {
    super();
    this.map = map;
    this.undoStack = [];
    this.redoStack = [];
  }

  apply(op, { history = true, inverse } = {}) {
    const inv = applyOp(this.map, op);
    if (history) {
      this.undoStack.push(inverse ?? inv);
      this.redoStack.length = 0;
    }
    this.dispatchEvent({ type: 'change', op });
    return op;
  }

  undo() {
    const op = this.undoStack.pop();
    if (!op) return;
    this.redoStack.push(applyOp(this.map, op));
    this.dispatchEvent({ type: 'change', op });
  }

  redo() {
    const op = this.redoStack.pop();
    if (!op) return;
    this.undoStack.push(applyOp(this.map, op));
    this.dispatchEvent({ type: 'change', op });
  }

  /** Replace the whole map (open, import, new). Clears history. */
  load(map) {
    this.map = map;
    this.undoStack = [];
    this.redoStack = [];
    this.dispatchEvent({ type: 'change', op: { op: 'load' } });
  }
}

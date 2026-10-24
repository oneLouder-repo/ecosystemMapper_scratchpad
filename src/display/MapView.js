import { EventDispatcher } from '../core/EventDispatcher.js';
import { ActorView } from './ActorView.js';
import { ConnectorView } from './ConnectorView.js';
import { LensView } from './LensView.js';

/**
 * Keeps the display list in step with the store: one ActorView per actor,
 * one ConnectorView per connector, and the lens backdrop. Also owns the
 * selection, which is view state rather than map data.
 *
 * Events: 'selection' when the selection changes.
 */
export class MapView extends EventDispatcher {
  selection = new Set();
  #actors = new Map();
  #connectors = new Map();

  constructor(stage, store, lenses) {
    super();
    this.stage = stage;
    this.store = store;
    this.lenses = lenses;
    this.lensView = stage.lensLayer.addChild(new LensView());
    store.addEventListener('change', () => this.sync());
  }

  get lens() {
    return this.lenses.get(this.store.map.lensId) ?? this.lenses.values().next().value;
  }

  viewFor(id) {
    return this.#actors.get(id) ?? this.#connectors.get(id) ?? null;
  }

  sync() {
    const { map } = this.store;
    const lens = this.lens;
    if (this.lensView.lensId !== lens.id) this.lensView.render(lens);

    const layers = new Map(map.layers.map((l) => [l.id, l]));
    const place = (view, item) => {
      const layer = layers.get(item.layerId) ?? map.layers[0];
      view.visible = layer?.visible !== false;
      view.node.classList.toggle('locked', Boolean(layer?.locked));
    };

    syncViews(this.#actors, map.actors, ActorView, this.stage.actorLayer, (view, actor) => {
      view.update(actor, lens);
      place(view, actor);
    });
    syncViews(this.#connectors, map.connectors, ConnectorView, this.stage.connectorLayer, (view, conn) => {
      view.update(conn, map, lens);
      place(view, conn);
    });

    const before = this.selection.size;
    for (const id of this.selection) if (!this.viewFor(id)) this.selection.delete(id);
    if (this.selection.size !== before) this.dispatchEvent('selection');
  }

  select(ids, { add = false } = {}) {
    if (!add) {
      for (const id of this.selection) {
        const view = this.viewFor(id);
        if (view) view.selected = false;
      }
      this.selection.clear();
    }
    for (const id of ids) {
      const view = this.viewFor(id);
      if (!view) continue;
      this.selection.add(id);
      view.selected = true;
    }
    this.dispatchEvent('selection');
  }

  deselect(ids) {
    for (const id of ids) {
      const view = this.viewFor(id);
      if (view) view.selected = false;
      this.selection.delete(id);
    }
    this.dispatchEvent('selection');
  }

  selectedItems() {
    const { map } = this.store;
    return {
      actorIds: [...this.selection].filter((id) => map.actors[id]),
      connectorIds: [...this.selection].filter((id) => map.connectors[id]),
    };
  }
}

function syncViews(views, items, ViewClass, container, update) {
  for (const [id, view] of views) {
    if (!items[id]) {
      container.removeChild(view);
      views.delete(id);
    }
  }
  for (const item of Object.values(items)) {
    let view = views.get(item.id);
    if (!view) {
      view = container.addChild(new ViewClass(item.id));
      views.set(item.id, view);
    }
    update(view, item);
  }
}

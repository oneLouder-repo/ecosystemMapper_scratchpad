import { EventDispatcher } from '../core/EventDispatcher.js';
import { project, regionAt } from '../lenses/index.js';
import { ActorView } from './ActorView.js';
import { ConnectorView } from './ConnectorView.js';
import { GroupView } from './GroupView.js';
import { LensView } from './LensView.js';

/**
 * Keeps the display list in step with the store: one view per actor,
 * connector and group, plus the lens backdrop. Also owns the selection,
 * which is view state rather than map data.
 *
 * Actors are stored by place ({ depth, spread }); `world` holds them
 * projected through the active lens, with x and y filled in. Anything that
 * needs board positions reads `mapView.world`, never the raw map.
 *
 * Events: 'selection' when the selection changes.
 */
export class MapView extends EventDispatcher {
  selection = new Set();
  world = { actors: {}, connectors: {}, groups: {} };
  #actors = new Map();
  #connectors = new Map();
  #groups = new Map();

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
    return this.#actors.get(id) ?? this.#connectors.get(id) ?? this.#groups.get(id) ?? null;
  }

  sync() {
    const { map } = this.store;
    const lens = this.lens;
    if (this.lensView.lensId !== lens.id) this.lensView.render(lens);

    const actors = {};
    for (const a of Object.values(map.actors)) actors[a.id] = { ...a, ...project(lens, a.place) };
    this.world = { actors, connectors: map.connectors, groups: map.groups ?? {} };

    const layers = new Map(map.layers.map((l) => [l.id, l]));
    const place = (view, item) => {
      const layer = layers.get(item.layerId) ?? map.layers[0];
      view.visible = layer?.visible !== false;
      view.node.classList.toggle('locked', Boolean(layer?.locked));
    };

    syncViews(this.#groups, this.world.groups, GroupView, this.stage.groupLayer, (view, group) => {
      view.update(group, this.world);
      place(view, group);
    });
    syncViews(this.#actors, actors, ActorView, this.stage.actorLayer, (view, actor) => {
      view.update(actor, lens);
      place(view, actor);
    });
    syncViews(this.#connectors, map.connectors, ConnectorView, this.stage.connectorLayer, (view, conn) => {
      view.update(conn, this.world, lens);
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

  /** Every visible actor in a lens region signals once, and the region lights up. */
  signalRegion(regionId) {
    const lens = this.lens;
    this.lensView.flash(regionId);
    for (const a of Object.values(this.store.map.actors)) {
      const view = this.#actors.get(a.id);
      if (view?.visible && regionAt(lens, a.place)?.id === regionId) view.signal();
    }
  }

  /**
   * Data viz focus: these actors and connectors pulse, everything else dims.
   * Pass null to clear it.
   */
  focus(ids) {
    const on = ids ? new Set(ids) : null;
    this.stage.svgEl.classList.toggle('dataviz-focus', Boolean(on));
    for (const [id, view] of this.#actors) view.pulsing = Boolean(on?.has(id));
    for (const [id, view] of this.#connectors) view.node.classList.toggle('focus', Boolean(on?.has(id)));
    for (const [id, view] of this.#groups) view.node.classList.toggle('focus', Boolean(on?.has(id)));
  }

  selectedItems() {
    const { map } = this.store;
    return {
      actorIds: [...this.selection].filter((id) => map.actors[id]),
      connectorIds: [...this.selection].filter((id) => map.connectors[id]),
      groupIds: [...this.selection].filter((id) => map.groups?.[id]),
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

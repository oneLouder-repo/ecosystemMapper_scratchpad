/**
 * The operation vocabulary. Every change to a map is a plain JSON op, e.g.
 *   { op: 'moveActor', id: 'actor_x', x: 120, y: 40 }
 *
 * `ops.*` build ops. `reducers.*` apply an op to a map (mutating it) and
 * return the inverse op, which is what undo applies. Later the same ops
 * travel over a websocket for multi-user editing.
 */

let counter = 0;
export function uid(prefix) {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function createMap({ name = 'Untitled map', lensId = 'micro-meso-macro' } = {}) {
  return {
    id: uid('map'),
    name,
    lensId,
    layers: [{ id: uid('layer'), name: 'Layer 1', visible: true, locked: false }],
    actors: {},
    connectors: {},
  };
}

export const ACTOR_SIZE = { w: 160, h: 64 };

export const ops = {
  addActor: ({ id = uid('actor'), ...data }) => ({
    op: 'addActor',
    id,
    data: { label: '', category: 'other', x: 0, y: 0, ...ACTOR_SIZE, layerId: null, meta: {}, ...data },
  }),
  updateActor: (id, patch) => ({ op: 'updateActor', id, patch }),
  moveActor: (id, x, y) => ({ op: 'moveActor', id, x, y }),
  removeActor: (id) => ({ op: 'removeActor', id }),

  /** A dock is { actorId } (attached) or { x, y } (a floating end). */
  addConnector: ({ id = uid('conn'), ...data }) => ({
    op: 'addConnector',
    id,
    data: { from: null, to: null, type: 'relationship', label: '', layerId: null, ...data },
  }),
  updateConnector: (id, patch) => ({ op: 'updateConnector', id, patch }),
  dockConnector: (id, end, dock) => ({ op: 'dockConnector', id, end, dock }),
  removeConnector: (id) => ({ op: 'removeConnector', id }),

  setLens: (lensId) => ({ op: 'setLens', lensId }),
  renameMap: (name) => ({ op: 'renameMap', name }),

  addLayer: ({ id = uid('layer'), ...data } = {}) => ({
    op: 'addLayer',
    id,
    data: { name: 'New layer', visible: true, locked: false, ...data },
  }),
  updateLayer: (id, patch) => ({ op: 'updateLayer', id, patch }),
  removeLayer: (id) => ({ op: 'removeLayer', id }),

  batch: (list) => ({ op: 'batch', ops: list }),

  /** Remove actors and connectors together, including connectors docked to removed actors. */
  removeItems(map, { actorIds = [], connectorIds = [] }) {
    const actors = new Set(actorIds);
    const conns = new Set(connectorIds);
    for (const c of Object.values(map.connectors)) {
      if (actors.has(c.from?.actorId) || actors.has(c.to?.actorId)) conns.add(c.id);
    }
    return ops.batch([
      ...[...conns].filter((id) => map.connectors[id]).map(ops.removeConnector),
      ...[...actors].filter((id) => map.actors[id]).map(ops.removeActor),
    ]);
  },
};

function must(item, what, id) {
  if (!item) throw new Error(`${what} not found: ${id}`);
  return item;
}

function patchInPlace(target, patch) {
  const prev = {};
  for (const k of Object.keys(patch)) prev[k] = target[k];
  Object.assign(target, structuredClone(patch));
  return prev;
}

export const reducers = {
  addActor(map, { id, data }) {
    map.actors[id] = { ...structuredClone(data), id };
    return ops.removeActor(id);
  },
  removeActor(map, { id }) {
    const { id: _, ...data } = must(map.actors[id], 'Actor', id);
    delete map.actors[id];
    return { op: 'addActor', id, data };
  },
  updateActor(map, { id, patch }) {
    return ops.updateActor(id, patchInPlace(must(map.actors[id], 'Actor', id), patch));
  },
  moveActor(map, { id, x, y }) {
    const a = must(map.actors[id], 'Actor', id);
    const inverse = ops.moveActor(id, a.x, a.y);
    a.x = x;
    a.y = y;
    return inverse;
  },

  addConnector(map, { id, data }) {
    map.connectors[id] = { ...structuredClone(data), id };
    return ops.removeConnector(id);
  },
  removeConnector(map, { id }) {
    const { id: _, ...data } = must(map.connectors[id], 'Connector', id);
    delete map.connectors[id];
    return { op: 'addConnector', id, data };
  },
  updateConnector(map, { id, patch }) {
    return ops.updateConnector(id, patchInPlace(must(map.connectors[id], 'Connector', id), patch));
  },
  dockConnector(map, { id, end, dock }) {
    const c = must(map.connectors[id], 'Connector', id);
    const inverse = ops.dockConnector(id, end, c[end]);
    c[end] = structuredClone(dock);
    return inverse;
  },

  setLens(map, { lensId }) {
    const inverse = ops.setLens(map.lensId);
    map.lensId = lensId;
    return inverse;
  },
  renameMap(map, { name }) {
    const inverse = ops.renameMap(map.name);
    map.name = name;
    return inverse;
  },

  addLayer(map, { id, data, index = map.layers.length }) {
    map.layers.splice(index, 0, { ...structuredClone(data), id });
    return ops.removeLayer(id);
  },
  updateLayer(map, { id, patch }) {
    const layer = must(map.layers.find((l) => l.id === id), 'Layer', id);
    return ops.updateLayer(id, patchInPlace(layer, patch));
  },
  removeLayer(map, { id }) {
    const index = map.layers.findIndex((l) => l.id === id);
    const { id: _, ...data } = must(map.layers[index], 'Layer', id);
    map.layers.splice(index, 1);
    return { op: 'addLayer', id, data, index };
  },

  batch(map, { ops: list }) {
    return ops.batch(list.map((op) => applyOp(map, op)).reverse());
  },
};

/** Apply one op to a map and return its inverse. */
export function applyOp(map, op) {
  const reducer = reducers[op.op];
  if (!reducer) throw new Error(`Unknown op: ${op.op}`);
  return reducer(map, op);
}

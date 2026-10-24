/**
 * A general op vocabulary for documents made of named collections of
 * records, e.g. { staff: { id: {...} }, teams: { id: {...} } }.
 * The org and strategy tools both use it; the ecosystem map has its own
 * (core/ops.js) because its ops carry more meaning.
 *
 *   store.apply(col.add('staff', { name: 'Sam' }));
 *   store.apply(col.update('staff', id, { name: 'Sam K.' }));
 *   store.apply(col.remove('staff', id));
 */
import { uid } from './ops.js';

export const col = {
  add: (collection, { id = uid(collection.replace(/s$/, '')), ...data }) => ({ op: 'add', collection, id, data }),
  update: (collection, id, patch) => ({ op: 'update', collection, id, patch }),
  remove: (collection, id) => ({ op: 'remove', collection, id }),
  set: (key, value) => ({ op: 'set', key, value }),
  batch: (ops) => ({ op: 'batch', ops }),
};

function must(doc, collection, id) {
  const item = doc[collection]?.[id];
  if (!item) throw new Error(`${collection} not found: ${id}`);
  return item;
}

export const reducers = {
  add(doc, { collection, id, data }) {
    doc[collection] ??= {};
    doc[collection][id] = { ...structuredClone(data), id };
    return col.remove(collection, id);
  },
  update(doc, { collection, id, patch }) {
    const item = must(doc, collection, id);
    const prev = {};
    for (const k of Object.keys(patch)) prev[k] = item[k];
    Object.assign(item, structuredClone(patch));
    return col.update(collection, id, prev);
  },
  remove(doc, { collection, id }) {
    const { id: _, ...data } = must(doc, collection, id);
    delete doc[collection][id];
    return col.add(collection, { id, ...data });
  },
  /** Set a top-level field, e.g. the org's name. */
  set(doc, { key, value }) {
    const prev = doc[key];
    doc[key] = structuredClone(value);
    return col.set(key, prev);
  },
  batch(doc, { ops }) {
    return col.batch(ops.map((op) => applyCollectionOp(doc, op)).reverse());
  },
};

export function applyCollectionOp(doc, op) {
  const reducer = reducers[op.op];
  if (!reducer) throw new Error(`Unknown op: ${op.op}`);
  return reducer(doc, op);
}

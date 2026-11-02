/**
 * Read-only views of a strategy for the Strategy & Work overview tabs:
 * the treemap's layout, workplan completion, and the roadmap's traffic
 * lights. Pure functions of the strategy doc, so they can be tested.
 */
import { childrenOf, rootOf, descendants, taskSummary, NODE_TYPES } from './strategy.js';
import { parse } from '../strategy/dates.js';

/** The strategy as nested { node, value, children } down to workplans; a workplan weighs its task count. */
export function strategyTree(doc) {
  const build = (n) => {
    if (n.type === 'workplan') return { node: n, value: Math.max(1, taskSummary(doc, n.id).total), children: [] };
    const children = childrenOf(doc, n.id).filter((c) => c.type !== 'task').map(build);
    return { node: n, value: children.reduce((s, c) => s + c.value, 0) || 1, children };
  };
  const root = rootOf(doc);
  return root ? build(root) : null;
}

/**
 * Squarified treemap (Bruls, Huizing and van Wijk): lay items out in rows
 * that keep each rectangle as close to square as possible.
 * items: [{ value }] → [{ item, x, y, w, h }]
 */
export function squarify(items, { x, y, w, h }) {
  const total = items.reduce((s, i) => s + i.value, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const scale = (w * h) / total;
  const queue = [...items].sort((a, b) => b.value - a.value).map((item) => ({ item, area: item.value * scale }));
  const out = [];
  const worst = (row, side) => {
    const s = row.reduce((t, r) => t + r.area, 0);
    return Math.max(...row.map((r) => Math.max((side * side * r.area) / (s * s), (s * s) / (side * side * r.area))));
  };
  const place = (row) => {
    const s = row.reduce((t, r) => t + r.area, 0);
    if (w >= h) {
      const rw = s / h;
      let yy = y;
      for (const r of row) { const rh = r.area / rw; out.push({ item: r.item, x, y: yy, w: rw, h: rh }); yy += rh; }
      x += rw; w -= rw;
    } else {
      const rh = s / w;
      let xx = x;
      for (const r of row) { const rw = r.area / rh; out.push({ item: r.item, x: xx, y, w: rw, h: rh }); xx += rw; }
      y += rh; h -= rh;
    }
  };
  let row = [];
  for (const next of queue) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, next], side) <= worst(row, side)) row.push(next);
    else { place(row); row = [next]; }
  }
  if (row.length) place(row);
  return out;
}

/** A task's traffic light: green when done, amber when open (under way or blocked), red when not started. */
export const LIGHTS = {
  green: { id: 'green', label: 'Completed', color: '#1f9d55' },
  amber: { id: 'amber', label: 'Open', color: '#e0a100' },
  red: { id: 'red', label: 'Still to do', color: '#d64545' },
};
export const lightOf = (task) => (task.status === 'done' ? 'green' : task.status === 'active' || task.status === 'blocked' ? 'amber' : 'red');

/**
 * How far along a workplan is: done tasks over all tasks, against how much
 * of its time has gone (so a half-done workplan at the half-way date is on track).
 */
export function workplanProgress(doc, id, today) {
  const wp = doc.nodes[id];
  const counts = taskSummary(doc, id);
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  let expected = null;
  if (wp.start && wp.end) {
    const span = parse(wp.end) - parse(wp.start);
    expected = Math.round(Math.max(0, Math.min(1, span > 0 ? (parse(today) - parse(wp.start)) / span : 1)) * 100);
  }
  const state = !counts.total ? 'empty'
    : pct === 100 ? 'complete'
    : expected === 0 && !counts.done && !counts.active ? 'not-started'
    : expected != null && pct < expected - 15 ? 'behind'
    : 'on-track';
  return { ...counts, pct, expected, state };
}

export const PROGRESS_STATES = {
  complete: { label: 'Complete', light: 'green' },
  'on-track': { label: 'On track', light: 'green' },
  behind: { label: 'Behind', light: 'amber' },
  'not-started': { label: 'Not started yet', light: 'red' },
  empty: { label: 'No tasks yet', light: 'red' },
};

/** The roadmap: every workplan with its path (plan › objective › goal) and its tasks in date order. */
export function roadmap(doc) {
  const out = [];
  const walk = (n, path) => {
    for (const c of childrenOf(doc, n.id)) {
      if (c.type === 'workplan') {
        const tasks = descendants(doc, c.id).filter((t) => t.type === 'task').sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.order - b.order);
        out.push({ workplan: c, path, tasks });
      } else if (c.type !== 'task') walk(c, [...path, c]);
    }
  };
  const root = rootOf(doc);
  if (root) walk(root, []);
  return out;
}

/** Counts of each node type, for the overview. */
export function strategyCounts(doc) {
  const counts = Object.fromEntries(Object.keys(NODE_TYPES).map((t) => [t, 0]));
  for (const n of Object.values(doc.nodes)) counts[n.type] = (counts[n.type] ?? 0) + 1;
  return counts;
}

import { col } from '../core/collections.js';
import { uid } from '../core/ops.js';

/**
 * The strategy document: one tree of nodes, from the strategic framework
 * at the root down to tasks.
 *
 *   framework  mission, vision, values               (the root)
 *   plan       start, end, theme; plans can nest inside plans (a master plan)
 *   objective  measures (KPIs to track later on dashboards)
 *   goal       measures
 *   workplan   start, end, staffIds, teamIds          (shows as a Gantt chart)
 *   task       start, end, status, assigneeIds, events (its lifetime timeline)
 *
 * Every node: { id, type, parentId, order, title, notes, ... }.
 * Stored as doc.nodes[id]; changes use the collection ops (core/collections.js).
 */
export const NODE_TYPES = {
  framework: { label: 'Strategic framework', children: ['plan'], glyph: '◆' },
  plan: { label: 'Strategic plan', children: ['plan', 'objective'], glyph: '▣', dated: true },
  objective: { label: 'Strategic objective', children: ['goal'], glyph: '◎' },
  goal: { label: 'Goal', children: ['workplan'], glyph: '○' },
  workplan: { label: 'Workplan', children: ['task'], glyph: '≡', dated: true },
  task: { label: 'Task', children: [], glyph: '▪', dated: true },
};

export const TASK_STATUSES = [
  { id: 'planned', label: 'Planned', color: '#9aa2b5' },
  { id: 'active', label: 'In progress', color: '#3d63dd' },
  { id: 'blocked', label: 'Blocked', color: '#b5442f' },
  { id: 'done', label: 'Done', color: '#2a9d8f' },
];
export const statusById = Object.fromEntries(TASK_STATUSES.map((s) => [s.id, s]));

const DEFAULTS = {
  framework: { mission: '', vision: '', values: '' },
  plan: { start: null, end: null, theme: '' },
  objective: { measures: [] },
  goal: { measures: [] },
  workplan: { start: null, end: null, staffIds: [], teamIds: [] },
  task: { start: null, end: null, status: 'planned', assigneeIds: [], events: [] },
};

export function childrenOf(doc, parentId) {
  return Object.values(doc.nodes)
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function rootOf(doc) {
  return Object.values(doc.nodes).find((n) => !n.parentId);
}

export function descendants(doc, id) {
  const out = [];
  const walk = (pid) => {
    for (const child of childrenOf(doc, pid)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

export function ancestors(doc, id) {
  const out = [];
  let node = doc.nodes[id];
  while (node?.parentId) {
    node = doc.nodes[node.parentId];
    if (node) out.unshift(node);
  }
  return out;
}

export const canHold = (parentType, childType) => NODE_TYPES[parentType]?.children.includes(childType) ?? false;

export const strategyOps = {
  /** Add a child node, checking it is allowed under its parent. */
  addNode(doc, { type, parentId, title, ...data }) {
    const parent = doc.nodes[parentId];
    if (parentId && !canHold(parent?.type, type)) throw new Error(`A ${type} can't go under a ${parent?.type}`);
    const siblings = childrenOf(doc, parentId);
    return col.add('nodes', {
      id: uid(type),
      type,
      parentId,
      order: siblings.length ? siblings.at(-1).order + 1 : 0,
      title: title ?? `New ${NODE_TYPES[type].label.toLowerCase()}`,
      notes: '',
      ...structuredClone(DEFAULTS[type]),
      ...data,
    });
  },

  update: (id, patch) => col.update('nodes', id, patch),

  /** Remove a node and everything under it, as one undoable step. */
  removeNode(doc, id) {
    return col.batch([...descendants(doc, id).reverse(), doc.nodes[id]].map((n) => col.remove('nodes', n.id)));
  },

  /** Add an entry to a task's lifetime. */
  addEvent(doc, taskId, { date, kind = 'note', text = '' }) {
    const task = doc.nodes[taskId];
    const events = [...task.events, { id: uid('ev'), date, kind, text }].sort((a, b) => a.date.localeCompare(b.date));
    return col.update('nodes', taskId, { events });
  },

  /** Change a task's status and record the change on its timeline. */
  setStatus(doc, taskId, status, date) {
    const task = doc.nodes[taskId];
    const events = [...task.events, { id: uid('ev'), date, kind: 'status', text: status }].sort((a, b) => a.date.localeCompare(b.date));
    return col.update('nodes', taskId, { status, events });
  },
};

/** Earliest start and latest end of a node and everything under it. */
export function dateSpan(doc, id) {
  const dated = [doc.nodes[id], ...descendants(doc, id)].filter((n) => n.start && n.end);
  if (!dated.length) return null;
  return {
    start: dated.map((n) => n.start).sort()[0],
    end: dated.map((n) => n.end).sort().at(-1),
  };
}

/** Task counts by status under a node. */
export function taskSummary(doc, id) {
  const tasks = (doc.nodes[id]?.type === 'task' ? [doc.nodes[id]] : descendants(doc, id)).filter((n) => n.type === 'task');
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s.id, 0]));
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return { total: tasks.length, ...counts };
}

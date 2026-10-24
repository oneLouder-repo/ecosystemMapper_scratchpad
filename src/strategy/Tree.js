import { h } from '../ui/dom.js';
import { NODE_TYPES, childrenOf, rootOf, statusById, taskSummary } from '../platform/strategy.js';
import { range } from './dates.js';

/** The strategy as an outline: click to open, ▸ to expand, + to add the first allowed child. */
export function Tree(ctx) {
  const { store, select, collapsed, selectedId } = ctx;
  const doc = store.doc;
  const root = rootOf(doc);

  const row = (n, depth) => {
    const kids = childrenOf(doc, n.id);
    const open = !collapsed.has(n.id);
    const type = NODE_TYPES[n.type];
    const meta =
      n.type === 'task' ? h('span', { class: 'dot', style: `background:${statusById[n.status]?.color}`, title: statusById[n.status]?.label })
      : n.type === 'workplan' ? h('span', { class: 'tree-meta' }, `${taskSummary(doc, n.id).done}/${taskSummary(doc, n.id).total}`)
      : type.dated && n.start ? h('span', { class: 'tree-meta' }, range(n.start, n.end).replace(/ \d+ /g, ' '))
      : null;
    return [
      h('li', { class: `tree-row type-${n.type}${n.id === selectedId ? ' selected' : ''}`, style: `padding-left:${8 + depth * 16}px` },
        kids.length
          ? h('button', { class: 'caret', 'aria-label': open ? 'Collapse' : 'Expand', 'aria-expanded': String(open),
              onclick: () => { open ? collapsed.add(n.id) : collapsed.delete(n.id); ctx.render(); } }, open ? '▾' : '▸')
          : h('span', { class: 'caret' }),
        h('span', { class: 'glyph', title: type.label }, type.glyph),
        h('button', { class: 'tree-title', onclick: () => select(n.id) }, n.title || 'Untitled'),
        meta,
        type.children.length > 0 && h('button', { class: 'tree-add', title: `Add ${NODE_TYPES[type.children.at(-1)].label.toLowerCase()}`,
          onclick: () => ctx.addChild(n.id, type.children.at(-1)) }, '+'),
      ),
      open && kids.flatMap((k) => row(k, depth + 1)),
    ];
  };

  return h('ul', { class: 'tree', role: 'tree' }, root ? row(root, 0) : []);
}

import { h } from '../ui/dom.js';
import { Shell } from '../ui/Shell.js';
import { Store } from '../core/Store.js';
import { applyCollectionOp } from '../core/collections.js';
import { autosaveDoc, loadOrSeed, saveDoc } from '../platform/storage.js';
import { seedOrg } from '../platform/org.js';
import { seedStrategy } from '../platform/strategySeed.js';
import { childrenOf, rootOf, strategyOps } from '../platform/strategy.js';
import { Tree } from './Tree.js';
import { Detail } from './Detail.js';

/**
 * Strategy & Work. The left side is the whole strategy as a tree; the right
 * side shows the selected item. The selection lives in the URL (#id) so a
 * link can point straight at a plan or task.
 */
const org = loadOrSeed('org', seedOrg);
const store = new Store(loadOrSeed('strategy', seedStrategy), applyCollectionOp);
autosaveDoc('strategy', store);
Shell(document.querySelector('#shell'), { current: 'strategy', org });

const ctx = {
  store,
  org,
  collapsed: new Set(),
  get selectedId() {
    const id = decodeURIComponent(location.hash.slice(1));
    return store.doc.nodes[id] ? id : rootOf(store.doc)?.id;
  },
  select(id) {
    if (location.hash !== `#${id}`) location.hash = id;
    else render();
  },
  addChild(parentId, type) {
    const op = store.apply(strategyOps.addNode(store.doc, { type, parentId }));
    ctx.collapsed.delete(parentId);
    ctx.select(op.id);
  },
  render: () => render(),
};

// Start with tasks folded away under their workplans.
for (const n of Object.values(store.doc.nodes)) if (n.type === 'workplan') ctx.collapsed.add(n.id);

const treePane = h('aside', { class: 'tree-pane' });
const detailPane = h('section', { class: 'detail-pane' });
const app = document.querySelector('#app');
app.classList.add('strategy');
app.replaceChildren(
  h('div', { class: 'strategy-bar' },
    h('strong', {}, 'Strategy & Work'),
    h('div', { class: 'spacer' }),
    h('button', { class: 'secondary', onclick: () => store.undo() }, 'Undo'),
    h('button', { class: 'secondary', onclick: () => store.redo() }, 'Redo'),
    h('button', { class: 'secondary', title: 'Replace with the example strategy', onclick: () => {
      if (!confirm('Load the example strategy? Your current strategy is replaced.')) return;
      store.load(seedStrategy());
      saveDoc('strategy', store.doc);
      ctx.select(rootOf(store.doc).id);
    } }, 'Example'),
  ),
  h('div', { class: 'strategy-body' }, treePane, detailPane),
);

function render() {
  // Open the path down to the selected item.
  let n = store.doc.nodes[ctx.selectedId];
  while (n?.parentId) {
    ctx.collapsed.delete(n.parentId);
    n = store.doc.nodes[n.parentId];
  }
  const scroll = detailPane.scrollTop;
  const focused = detailPane.contains(document.activeElement) ? document.activeElement.name : null;
  treePane.replaceChildren(Tree(ctx));
  detailPane.replaceChildren(Detail(ctx));
  detailPane.scrollTop = scroll;
  // Fields carry a name so focus survives the redraw.
  if (focused) detailPane.querySelector(`[name="${focused}"]`)?.focus();
}

store.addEventListener('change', render);
window.addEventListener('hashchange', () => {
  detailPane.scrollTop = 0;
  detailPane.replaceChildren(Detail(ctx));
  render();
});
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? store.redo() : store.undo();
  }
});
render();

// For poking at things from the browser console.
window.strategy = ctx;
window.strategy.childrenOf = (id) => childrenOf(store.doc, id);

import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openAssetChooser } from '../ui/AssetChooser.js';
import { ASSET_KINDS, kindById, resolveAsset, assetsUnder, groupAssets } from '../platform/assets.js';
import { NODE_TYPES, strategyOps } from '../platform/strategy.js';

/**
 * The asset toolbox for a task or workplan, and the roll-up of every asset
 * used beneath a workplan, goal, objective or plan.
 */
export function AssetsPanel(ctx, n) {
  const { store } = ctx;
  const own = n.assets ?? [];
  const docs = { ...ctx.docs, strategy: store.doc };
  const add = () => openAssetChooser({
    docs,
    node: n,
    current: () => store.doc.nodes[n.id]?.assets ?? [],
    onPick: (asset) => store.apply(strategyOps.update(n.id, { assets: [...(store.doc.nodes[n.id].assets ?? []), asset] })),
  });
  const remove = (id) => store.apply(strategyOps.update(n.id, { assets: own.filter((a) => a.id !== id) }));

  const holdsOwn = n.type === 'task' || n.type === 'workplan';
  const below = n.type === 'task' ? [] : groupAssets(assetsUnder(store.doc, n.id).filter((u) => u.from.id !== n.id));

  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', {}, n.type === 'task' ? 'Toolbox' : `Assets ${holdsOwn ? 'for this workplan' : 'used in this ' + NODE_TYPES[n.type].label.toLowerCase()}`),
      holdsOwn && h('button', { class: 'secondary', onclick: add }, icon('plus', 16), 'Add asset')),
    holdsOwn && (own.length
      ? h('ul', { class: 'asset-list' }, own.map((a) => row(a, docs, { remove: () => remove(a.id) })))
      : h('p', { class: 'muted' }, n.type === 'task'
        ? 'Nothing yet. Add the actors, people, documents, links, research and media this task uses.'
        : 'Nothing at the workplan level. Tasks below can have their own.')),
    below.length > 0 && h('div', { class: 'asset-groups' },
      n.type === 'workplan' && h('h2', {}, 'Used by tasks in this workplan'),
      ASSET_KINDS.map((k) => {
        const items = below.filter((g) => g.asset.kind === k.id);
        return items.length > 0 && [
          h('h3', {}, icon(k.icon, 16), `${k.label} (${items.length})`),
          h('ul', { class: 'asset-list' }, items.map((g) => row(g.asset, docs, { from: g.from, select: ctx.select }))),
        ];
      })),
    !holdsOwn && !below.length && h('p', { class: 'muted' }, 'No assets yet. Add them to tasks and workplans and they gather here.'),
  );
}

function row(asset, docs, { remove, from, select } = {}) {
  const r = resolveAsset(asset, docs);
  const external = r.href && !r.href.endsWith('.html') && !r.href.includes('.html#');
  return h('li', { class: `asset${r.missing ? ' missing' : ''}` },
    icon(kindById[asset.kind]?.icon ?? 'doc', 18),
    h('div', { class: 'asset-text' },
      r.href
        ? h('a', { class: 'label', href: r.href, target: external ? '_blank' : null, rel: external ? 'noopener' : null, download: asset.dataUrl ? asset.label : null }, r.label)
        : h('span', { class: 'label' }, r.label),
      h('small', {}, r.sub)),
    from && h('span', { class: 'from' }, 'in ',
      from.map((f, i) => [i ? ', ' : '', h('button', { class: 'link-button', onclick: () => select(f.id) }, f.title)])),
    remove && h('button', { class: 'icon-button', title: 'Remove from toolbox', 'aria-label': `Remove ${r.label}`, onclick: remove }, '×'),
  );
}

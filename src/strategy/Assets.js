import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openAssetChooser } from '../ui/AssetChooser.js';
import { ASSET_KINDS, kindById, resolveAsset, assetsUnder, groupAssets } from '../platform/assets.js';
import { NODE_TYPES, strategyOps } from '../platform/strategy.js';

/**
 * The asset toolbox for a task or workplan, and the roll-up of every asset
 * used beneath a workplan, goal, objective or plan. Assets show as small
 * tiles with a floating tooltip, or as a list (the choice is remembered).
 */
const VIEW_KEY = 'org-toolbox:asset-view';
const getView = () => { try { return localStorage.getItem(VIEW_KEY) ?? 'tiles'; } catch { return 'tiles'; } };
const setView = (v) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-viewer nicety only */ } };
let tipCount = 0;
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

  const view = getView();
  const item = view === 'tiles' ? tile : row;
  const list = (children) => h('ul', { class: view === 'tiles' ? 'asset-tiles' : 'asset-list' }, children);

  return h('section', { class: 'panel' },
    h('div', { class: 'panel-head' },
      h('h2', {}, n.type === 'task' ? 'Toolbox' : `Assets ${holdsOwn ? 'for this workplan' : 'used in this ' + NODE_TYPES[n.type].label.toLowerCase()}`),
      h('div', { class: 'panel-tools' },
        h('div', { class: 'join' }, [['tiles', 'Tiles'], ['list', 'List']].map(([v, label]) =>
          h('button', { class: `btn btn-xs join-item${view === v ? ' btn-active' : ''}`, 'aria-pressed': String(view === v), onclick: () => { setView(v); ctx.render(); } }, label))),
        holdsOwn && h('button', { class: 'btn btn-sm', onclick: add }, icon('plus', 16), 'Add asset'))),
    holdsOwn && (own.length
      ? list(own.map((a) => item(a, docs, { remove: () => remove(a.id) })))
      : h('p', { class: 'muted' }, n.type === 'task'
        ? 'Nothing yet. Add the actors, people, documents, links, research and media this task uses.'
        : 'Nothing at the workplan level. Tasks below can have their own.')),
    below.length > 0 && h('div', { class: 'asset-groups' },
      n.type === 'workplan' && h('h2', {}, 'Used by tasks in this workplan'),
      ASSET_KINDS.map((k) => {
        const items = below.filter((g) => g.asset.kind === k.id);
        return items.length > 0 && [
          h('h3', {}, icon(k.icon, 16), `${k.label} (${items.length})`),
          list(items.map((g) => item(g.asset, docs, { from: g.from, select: ctx.select }))),
        ];
      })),
    !holdsOwn && !below.length && h('p', { class: 'muted' }, 'No assets yet. Add them to tasks and workplans and they gather here.'),
  );
}

/** A small icon tile; details float in a tooltip on hover or focus. */
function tile(asset, docs, { remove, from } = {}) {
  const r = resolveAsset(asset, docs);
  const external = r.href && !r.href.includes('.html');
  const tipId = `asset-tip-${++tipCount}`;
  const face = [
    icon(kindById[asset.kind]?.icon ?? 'doc', 22),
    h('span', { class: 'tile-label' }, r.label),
    from?.length > 1 && h('span', { class: 'tile-count', 'aria-hidden': 'true' }, `×${from.length}`),
  ];
  const attrs = { class: 'tile-face', 'aria-describedby': tipId };
  return h('li', { class: `asset-tile${r.missing ? ' missing' : ''}` },
    r.href
      ? h('a', { ...attrs, href: r.href, target: external ? '_blank' : null, rel: external ? 'noopener' : null, download: asset.dataUrl ? asset.label : null }, face)
      : h('span', { ...attrs, tabindex: '0' }, face),
    h('div', { class: 'tile-tip', role: 'tooltip', id: tipId },
      h('strong', {}, r.label),
      h('span', {}, `${kindById[asset.kind]?.label ?? asset.kind} · ${r.sub}`),
      from && h('span', {}, `Used in ${from.map((f) => f.title).join(', ')}`)),
    remove && h('button', { class: 'tile-remove', title: 'Remove from toolbox', 'aria-label': `Remove ${r.label}`, onclick: remove }, '×'),
  );
}

function row(asset, docs, { remove, from, select } = {}) {
  const r = resolveAsset(asset, docs);
  const external = r.href && !r.href.endsWith('.html') && !r.href.includes('.html#');
  return h('li', { class: `asset${r.missing ? ' missing' : ''}` },
    icon(kindById[asset.kind]?.icon ?? 'doc', 18),
    h('div', { class: 'asset-text' },
      r.href
        ? h('a', { class: 'asset-label', href: r.href, target: external ? '_blank' : null, rel: external ? 'noopener' : null, download: asset.dataUrl ? asset.label : null }, r.label)
        : h('span', { class: 'asset-label' }, r.label),
      h('small', {}, r.sub)),
    from && h('span', { class: 'from' }, 'in ',
      from.map((f, i) => [i ? ', ' : '', h('button', { class: 'link-button', onclick: () => select(f.id) }, f.title)])),
    remove && h('button', { class: 'icon-button', title: 'Remove from toolbox', 'aria-label': `Remove ${r.label}`, onclick: remove }, '×'),
  );
}

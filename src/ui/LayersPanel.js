import { h } from './dom.js';

/** Lists layers: pick the active one, show or hide, lock, rename, add. */
export function LayersPanel(el, ctx) {
  const { store, ops, ui } = ctx;

  function render() {
    if (el.contains(document.activeElement) && document.activeElement.type === 'text') return;
    const { layers } = store.map;
    if (!layers.some((l) => l.id === ui.activeLayerId)) ui.activeLayerId = layers[0]?.id;

    el.replaceChildren(
      h('div', { class: 'panel-head' },
        h('h2', {}, 'Layers'),
        h('button', { class: 'icon-button', title: 'Add layer', onclick: () => {
          const op = store.apply(ops.addLayer({ name: `Layer ${layers.length + 1}` }));
          ui.activeLayerId = op.id;
          render();
        } }, '+'),
      ),
      h('ul', { class: 'layers' },
        [...layers].reverse().map((layer) =>
          h('li', { class: layer.id === ui.activeLayerId ? 'active' : '' },
            h('input', { type: 'radio', name: 'active-layer', title: 'New items go here', checked: layer.id === ui.activeLayerId,
              onchange: () => { ui.activeLayerId = layer.id; render(); } }),
            h('input', { type: 'text', value: layer.name, 'aria-label': 'Layer name',
              onchange: (e) => store.apply(ops.updateLayer(layer.id, { name: e.target.value })) }),
            h('button', { class: `icon-button${layer.visible ? '' : ' off'}`, title: layer.visible ? 'Hide' : 'Show',
              onclick: () => store.apply(ops.updateLayer(layer.id, { visible: !layer.visible })) }, layer.visible ? '👁' : '◌'),
            h('button', { class: `icon-button${layer.locked ? '' : ' off'}`, title: layer.locked ? 'Unlock' : 'Lock',
              onclick: () => store.apply(ops.updateLayer(layer.id, { locked: !layer.locked })) }, layer.locked ? '🔒' : '🔓'),
          ),
        ),
      ),
    );
  }

  store.addEventListener('change', render);
  render();
}

import { h } from './dom.js';
import { icon } from './icons.js';

/** Builds a button per registered tool and keeps the active one highlighted. */
export function Toolbar(el, tools) {
  const render = () => {
    el.replaceChildren(
      ...[...tools.tools.values()].map((tool) =>
        h(
          'button',
          {
            class: `tool${tool === tools.active ? ' active' : ''}`,
            title: `${tool.label}${tool.key ? ` (${tool.key.toUpperCase()})` : ''}`,
            'aria-pressed': String(tool === tools.active),
            onclick: () => tools.toggle(tool.id),
          },
          h('span', { class: 'tool-icon' }, icon(tool.icon)),
          h('span', { class: 'tool-label' }, tool.label),
        ),
      ),
    );
  };
  tools.addEventListener('change', render);
  render();
}
